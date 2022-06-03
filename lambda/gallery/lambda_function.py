import json
import boto3
import io
import os
import zipfile
import pathlib
import re
import subprocess
import datetime
import time
import random
import secrets
import hashlib
import sqlite3
import string
import base64

EFSMNT = '/mnt/collect'
MIME = {
	'csv':'text/csv','html':'text/html','svg':'image/svg+xml',
	'wasm':'application/wasm','js':'text/javascript','frag':'text/plain',
	'vert':'text/plain','json':'application/json','jpg':'image/jpeg',
	'png':'image/png','mp3':'audio/mpeg','zip':'application/zip',
}
INITDBSQL = '''
CREATE TABLE IF NOT EXISTS participant (
 id INT, gallery TEXT, ip TEXT,
 -- When did the client join, according to the client
 client_milli INT,
 -- When did the client join, according to the server
 server_milli INT
);
CREATE TABLE IF NOT EXISTS pos (
 id INT, milli INT,
 x REAL, y REAL,
 yaw REAL, pitch REAL
);
CREATE TABLE IF NOT EXISTS perf (
 id INT, milli INT,
 -- Graphical draws
 dfps REAL, dtime REAL,
 -- Game-logic iterations
 ifps REAL, itime REAL
);
CREATE TABLE IF NOT EXISTS evt (
 id INT, milli INT,
 msg TEXT
);
'''
ACCESSKEYHASH = b''
ACCESSKEYREFRESHTIME = 0
def check_accesskey(accesskey):
	global ACCESSKEYHASH, ACCESSKEYREFRESHTIME
	t = time.time()
	if t-ACCESSKEYREFRESHTIME > 30:
		# We checked more than 30sec ago
		s3_client = boto3.client('s3')
		ACCESSKEYHASH = b''
		tempbytes = io.BytesIO()
		try:
			# Download the hash file
			s3_client.download_fileobj(os.environ['bucket'], 'private/accessKeyHash.bin', tempbytes)
			# And save the value to our local variable
			ACCESSKEYHASH = tempbytes.getvalue()
			ACCESSKEYREFRESHTIME = t
		except:
			pass
	testHash = hashlib.scrypt(password=accesskey.encode('UTF-8'), salt=os.environ['accessPepper'].encode('UTF-8'), n=16384, r=8, p=1)
	return testHash == ACCESSKEYHASH

def change_accesskey():
	newAccessKey = ''.join([secrets.choice(string.digits + string.ascii_letters) for i in range(16)])
	newHash = hashlib.scrypt(password=newAccessKey.encode('UTF-8'), salt=os.environ['accessPepper'].encode('UTF-8'), n=16384, r=8, p=1)
	s3_client=boto3.client('s3')
	s3_client.upload_fileobj(Fileobj=io.BytesIO(newHash), Bucket=os.environ['bucket'], Key='private/accessKeyHash.bin',  ExtraArgs={'ContentType': 'application/octet-stream', 'CacheControl': 'no-cache'})
	return {
		'statusCode': 200,
		'body': json.dumps({"newAccessKey":newAccessKey})
	}

def presign_upload(filename, bucket):
	s3_client = boto3.client('s3')#, region_name='us-east-1')
	presigned = s3_client.generate_presigned_post(Bucket=bucket, Key='zip/'+filename, ExpiresIn=1800)
	return {
		'statusCode': 200,
		'body': json.dumps({"upload":presigned})
	}
def unzip_upload(filename, bucket):
	global MIME
	#https://medium.com/@johnpaulhayes/how-extract-a-huge-zip-file-in-an-amazon-s3-bucket-by-using-aws-lambda-and-python-e32c6cf58f06    
	s3 = boto3.resource('s3')
	zip_obj = s3.Object(bucket, "zip/"+filename)
	buf = io.BytesIO(zip_obj.get()["Body"].read())
	z = zipfile.ZipFile(buf)
	for member_name in z.namelist():
		mime = 'application/octet-stream'
		suffix = member_name.split('.')[-1].lower()
		if suffix in MIME:
			mime = MIME[suffix]
		file_info = z.getinfo(member_name)
		s3.meta.client.upload_fileobj(z.open(member_name), Bucket=bucket, Key='uploads/'+member_name, ExtraArgs={'ContentType': mime, 'CacheControl': 'no-cache'})
	return {
		  'statusCode': 200,
		  'body': json.dumps('Successfully unzipped')
	}
def list_galleries(bucket):
	s3 = boto3.client('s3')
	# FIXME: I should restructure this to be able to use delimiter more effectively. (But at least excluding images is better than nothing)
	objList = s3.list_objects_v2(
		Bucket=bucket,
		Prefix='uploads/',
		Delimiter='/img/'
	)
	# Split based on folders, then choose the folder following 'uploads', then remove duplicates
	galleries = list()
	if 'Contents' in objList:
		galleries = list(set([o['Key'].split('/')[1] for o in objList['Contents']]))
	return {
		'statusCode':200,
		'body': json.dumps({
			'contents': galleries
		})
	}
def delete_gallery(filename, bucket):
	s3 = boto3.client('s3')
	objList = s3.list_objects_v2(
		Bucket = bucket,
		Prefix = 'uploads/'+filename
	)
	res = [o['Key'] for o in objList['Contents']];
	s3.delete_objects(
		Bucket = bucket,
		Delete = {
			'Objects':[{'Key': k} for k in res]
		}
	)
	return {'statusCode':200, 'body': json.dumps({"deletions":res})}

def prepare_data_export(param, bucket):
	global EFSMNT
	target = param['target']
	dbpath = pathlib.Path(EFSMNT,"exports",target+".sqlite3")
	zipname = 'export_{}_{:05X}.zip'.format(target, random.randrange(16**5))
	zippath = pathlib.Path(EFSMNT, zipname)
	zipremote = 'private/export/'+zipname
	with zipfile.ZipFile(zippath, mode='w') as zfp:
		zfp.write(dbpath, arcname=target+".sqlite3")
	s3 = boto3.client('s3')
	s3.upload_file(str(zippath), bucket, zipremote, ExtraArgs={'ContentType':'application/zip'})
	# We are done uploading, so delete this zip
	zippath.unlink()
	presigned = s3.generate_presigned_url('get_object', Params={'Bucket':bucket, 'Key':zipremote}, ExpiresIn=3600)
	# Clean up anything in s3 that has aged out
	oldObjList = s3.list_objects_v2(
		Bucket = bucket,
		Prefix = 'private/export/',
		Delimiter='/'
	)
	delOld = []
	now = datetime.datetime.now(datetime.timezone.utc)
	for o in oldObjList['Contents']:
		if (now - o['LastModified']).total_seconds() > 3600*72:
			delOld.append(o['Key'])
	if len(delOld) > 0:
		s3.delete_objects(
			Bucket = bucket,
			Delete = {
				'Objects':[{'Key': k} for k in delOld]
			}
		)
	return {
		'statusCode': 200,
		'body': json.dumps({"download":presigned})
	}
def delete_export(param):
	global EFSMNT
	retentionDays = 365.0
	msCutoff = int((time.time() - retentionDays*24*60*60)*1000)
	message = "Unknown error while deleting."
	try:
		target = pathlib.Path(EFSMNT, "exports", param['target']+".sqlite3")
		if target.exists():
			conn = sqlite3.connect(target)
			cur = conn.cursor()
			cur.row_factory = sqlite3.Row
			cur.execute("SELECT MAX(client_milli) as time FROM participant;")
			msLatest = cur.fetchall()[0]['time']
			conn.close()
			if msLatest < msCutoff:
				# The last participant was more than retentionDays ago
				subprocess.run(["rm", target], check=True)
				message = "Successfully deleted"
			else:
				message = "This data cannot be deleted because the latest participation was less than {} days ago.".format(retentionDays)
		else:
			message = "This data cannot be deleted because the path \"{}\" does not exist.".format(target)
	except:
		pass
	return {
		'statusCode': 200,
		'body': json.dumps({"message":message})
	}
	

def list_exports():
	global EFSMNT
	targets = []
	exportTime = "Never"
	try:
		for p in pathlib.Path(EFSMNT+'/exports').iterdir():
			fname = p.parts[-1]
			if (re.fullmatch('^.*sqlite3$', fname) is None):
				continue
			targets.append('.'.join(fname.split('.')[:-1]))
		with open(EFSMNT+'/exports/timestamp.txt', 'r') as tsfp:
			exportTime = datetime.datetime.fromtimestamp(int(tsfp.read()), tz=datetime.timezone.utc).isoformat()
	except:
		pass
	return {
		'statusCode': 200,
		'body': json.dumps({
			"exportTime":exportTime,
			"targets":targets
		})
	}
	
def regenerate_exports():
	global INITDBSQL, EFSMNT
	regenStartTime = time.time()
	# Execute only one regeneration at a time
	hasMutex = (subprocess.run(['mkdir', EFSMNT+'/exportLock.d']).returncode == 0)
	if not hasMutex:
		mutexCreationTime = subprocess.run(['stat', '--format=%y', EFSMNT+'/exportLock.d'], capture_output=True).stdout.decode('UTF-8')
		if mutexCreationTime == '':
			mutexCreationTime = 'Unknown Creation Time'
		return {
			'statusCode': 200,
			'body': json.dumps({"message":"Export mutex consumed ("+mutexCreationTime+" <= This value should be less than 15 minutes ago for a running job). Is regeneration already ongoing?"})
		}
	# Create a directory to save our exports in
	subprocess.run(['mkdir', '-p', EFSMNT+"/exports"])
	# Create a directory to work in
	subprocess.run(['cp', '--recursive', EFSMNT+"/exports", EFSMNT+"/tmpexports"])
	# Figure out what time the existing export (if any) is valid until
	startTimestamp = 0
	try:
		with open(EFSMNT+"/tmpexports/timestamp.txt", "r") as tsfp:
			startTimestamp = int(tsfp.read())
	except:
		pass
	# Figure out what time the new export should be valid until, and record it.
	# Use data that is at least 10 minutes old. This is necessary to not miss data coming from people with messed-up clocks (which is, thankfully, not as common as it used to be)
	endTimestamp = int(time.time() - 600)
	#if startTimestamp != 0 and startTimestamp + (60*60*24) < endTimestamp:
		# We are dealing with a period of time greater than a day. Only process a day at a time.
	#	endTimestamp = startTimestamp + (60*60*24)
	with open(EFSMNT+"/tmpexports/timestamp.txt", "w") as tsfp:
		tsfp.write(str(endTimestamp))
	# For all databases, read everything in the time range and write to the relevant db file.
	baseFolders = []
	## Find all of our base folders
	for p in pathlib.Path(EFSMNT).iterdir():
		yearmonthname = p.parts[-1]
		if (re.fullmatch('^[0-9]{4}_[0-9]{2}$', yearmonthname) is None):
			continue
		baseFolders.append(p)
	dbFiles = []
	## Iterate thrugh all unsorted databases
	for p in baseFolders:
		# all per-day folders
		for p2 in p.iterdir():
			# all database files
			for p3 in p2.iterdir():
				dbFiles.append(p3)
	# Combined connection. This aggregates our new data.
	c_conn = sqlite3.connect(':memory:')
	c_cur = c_conn.cursor()
	c_cur.row_factory = sqlite3.Row
	c_cur.executescript(INITDBSQL)
	msTSParams = (startTimestamp * 1000, endTimestamp * 1000)
	for dbf in dbFiles:
		dbfStat = dbf.stat()
		if dbfStat.st_mtime < startTimestamp - 600:
			continue
		# This is NOT Creation time.
		#if dbfStat.st_ctime > endTimestamp + 600:
		#	continue
		try:
			conn = sqlite3.connect(dbf)
			db = conn.cursor()
			db.row_factory = sqlite3.Row
			db.execute('SELECT id,gallery,ip,client_milli,server_milli FROM participant WHERE client_milli >= ? AND client_milli < ?;', msTSParams)
			for r in db:
				c_cur.execute('INSERT INTO participant (id,gallery,ip,client_milli,server_milli) values (?,?,?,?,?);', (r['id'],r['gallery'],r['ip'],r['client_milli'],r['server_milli']))
			db.execute('SELECT id,milli,x,y,pitch,yaw FROM pos WHERE milli >= ? AND milli < ?;', msTSParams)
			for r in db:
				c_cur.execute('INSERT INTO pos (id,milli,x,y,pitch,yaw) VALUES (?,?,?,?,?,?);', (r['id'],r['milli'],r['x'],r['y'],r['pitch'],r['yaw']))
			db.execute('SELECT id,milli,dfps,dtime,ifps,itime FROM perf WHERE milli >= ? AND milli < ?;', msTSParams)
			for r in db:
				c_cur.execute('INSERT INTO perf (id,milli,dfps,dtime,ifps,itime) VALUES (?,?,?,?,?,?);', (r['id'],r['milli'],r['dfps'],r['dtime'],r['ifps'],r['itime']))
			db.execute('SELECT id,milli,msg FROM evt WHERE milli >= ? AND milli < ?;', msTSParams)
			for r in db:
				c_cur.execute('INSERT INTO evt (id,milli,msg) VALUES (?,?,?);', (r['id'],r['milli'],r['msg']))
			conn.close()
		except:
			pass
	# Figure out which galleries we need to check for (this is deceptively hard, since participants could have data during this time slice without _joining_ during this time slice
	galleryDBs = set()
	## Add galleries that we already have some info on
	for p in pathlib.Path(EFSMNT+"/tmpexports").iterdir():
		fname = p.parts[-1]
		if (re.fullmatch('^.*sqlite3$', fname) is None):
			continue
		galleryDBs.add('.'.join(fname.split('.')[:-1]))
	## Add galleries that were added in this timeslice
	c_cur.execute('SELECT DISTINCT gallery FROM participant;')
	for r in c_cur:
		galleryDBs.add(str(r['gallery']))
	for gdb in galleryDBs:
		print(gdb+".sqlite3")
		conn = sqlite3.connect(str(pathlib.Path(EFSMNT,"tmpexports",gdb+".sqlite3")))
		db = conn.cursor()
		db.row_factory = sqlite3.Row
		db.executescript(INITDBSQL)
		# Send over all new participants
		c_cur.execute('SELECT id,gallery,ip,client_milli,server_milli FROM participant WHERE gallery = ?;', (gdb,))
		for r in c_cur:
			db.execute('INSERT INTO participant (id,gallery,ip,client_milli,server_milli) values (?,?,?,?,?);', (r['id'],r['gallery'],r['ip'],r['client_milli'],r['server_milli']))
		# Make a table in our temp database recording all participants that we need to record data for.
		c_cur.execute('DROP TABLE IF EXISTS tpid;')
		c_cur.execute('CREATE TABLE tpid (id INT);')
		c_cur.execute('CREATE INDEX index_tpid ON tpid (id);')
		db.execute('SELECT id FROM participant;')
		for r in db:
			splitid = r['id'].split('_')
			if len(splitid) != 2:
				continue
			c_cur.execute('INSERT INTO tpid (id) VALUES (?);', (splitid[1],))
		c_cur.execute('SELECT id,milli,x,y,pitch,yaw FROM pos WHERE id IN (SELECT id FROM tpid);')
		for r in c_cur:
			db.execute('INSERT INTO pos (id,milli,x,y,pitch,yaw) VALUES (?,?,?,?,?,?);', (r['id'],r['milli'],r['x'],r['y'],r['pitch'],r['yaw']))
		c_cur.execute('SELECT id,milli,dfps,dtime,ifps,itime FROM perf WHERE id IN (SELECT id FROM tpid);')
		for r in c_cur:
			db.execute('INSERT INTO perf (id,milli,dfps,dtime,ifps,itime) VALUES (?,?,?,?,?,?);', (r['id'],r['milli'],r['dfps'],r['dtime'],r['ifps'],r['itime']))
		c_cur.execute('SELECT id,milli,msg FROM evt WHERE id IN (SELECT id FROM tpid);')
		for r in c_cur:
			db.execute('INSERT INTO evt (id,milli,msg) VALUES (?,?,?);', (r['id'],r['milli'],r['msg']))
		conn.commit()
		conn.close()
	## Add galleries that people joined this time
	# Delete all databases which are over 90 days old without any writes.
	deleteTimeThreshold = startTimestamp - 60*60*24*90
	for dbf in dbFiles:
		if dbf.stat().st_mtime < deleteTimeThreshold:
			# This file was modified long enough ago to safely delete. Lambda functions live at most 14Hr.
			dbf.unlink()
	## Delete all empty folders
	for p in baseFolders:
		for p2 in p.iterdir():
			if len(list(p2.iterdir())) == 0:
				# empty directory
				p2.rmdir()
		if len(list(p.iterdir())) == 0:
			p.rmdir()
	# Clobber our export directory
	subprocess.run(['rm', '-rf', EFSMNT+"/exports"])
	subprocess.run(['mv', EFSMNT+"/tmpexports", EFSMNT+"/exports"])
	# Remove our mutex
	subprocess.run(['rmdir', EFSMNT+'/exportLock.d'])
	return {
		'statusCode': 200,
		'body': json.dumps({"message":"Done. Elapsed time: " + str(time.time()-regenStartTime)+"sec"})
	}
def data_usage():
	usage = subprocess.run(['du', '--human-readable', '--summarize', EFSMNT], capture_output=True).stdout.decode('UTF-8')
	return {
		'statusCode': 200,
		'body': json.dumps({"usage":usage})
	}
def console_exec(comm):
	ret = subprocess.run(comm, shell=True, capture_output=True)
	return {
		'statusCode': 200,
		'body': json.dumps({
			'ret': ret.returncode,
			'stdout': base64.b64encode(ret.stdout).decode('UTF-8'),
			'stderr': base64.b64encode(ret.stderr).decode('UTF-8')
		})
	}

def lambda_handler(event, context):
	bodyjson = json.loads(event['body'])
	if not check_accesskey(bodyjson['accessKey']):
		return { 'statusCode': 401, 'body': 'bad access key' }
	
	# We are authenticated
	
	if(bodyjson['operation'] == 'presign_upload'):
		# Allow trusted client to upload to s3
		return presign_upload(bodyjson['filename'], os.environ['bucket'])
	elif(bodyjson['operation'] == 'unzip_upload'):
		# Unzip an uploaded zip in s3
		return unzip_upload(bodyjson['filename'], os.environ['bucket'])
	elif(bodyjson['operation'] == 'list_galleries'):
		return list_galleries(os.environ['bucket'])
	elif(bodyjson['operation'] == 'delete_gallery'):
		return delete_gallery(bodyjson['filename'], os.environ['bucket'])
	elif(bodyjson['operation'] == 'regenerate_exports'):
		return regenerate_exports()
	elif(bodyjson['operation'] == 'list_exports'):
		return list_exports()
	elif(bodyjson['operation'] == 'prepare_data_export'):
		return prepare_data_export(event['queryStringParameters'], os.environ['bucket'])
	elif(bodyjson['operation'] == 'delete_export'):
		return delete_export(event['queryStringParameters']);
	elif(bodyjson['operation'] == 'data_usage'):
		return data_usage()
	elif(bodyjson['operation'] == 'console_exec'):
		return console_exec(bodyjson['filename'])
	elif(bodyjson['operation'] == 'test_login'):
		return {'statusCode': 200, 'body':'{}'}
	elif(bodyjson['operation'] == 'change_accesskey'):
		return change_accesskey()
	else:
		return { 'statusCode': 404, 'body': 'unknown operation' }


