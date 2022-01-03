# uploadGallery

import json
import boto3
import io
import os
import zipfile
import pathlib
import re
import subprocess
import datetime
import random

UPLOADMAX = 200 #mb
EFSMNT = '/mnt/collect'

def presign_upload(filename, bucket):
	global UPLOADMAX
	s3_client = boto3.client('s3')
	presigned = s3_client.generate_presigned_url('put_object', Params={'Bucket':bucket, 'Key':'zip/'+filename, 'ContentType':'application/zip'}, ExpiresIn=1800, HttpMethod="PUT")
	return {
		'statusCode': 200,
		'body': json.dumps({"upload":presigned})
	}
def unzip_upload(filename, bucket):
	#https://medium.com/@johnpaulhayes/how-extract-a-huge-zip-file-in-an-amazon-s3-bucket-by-using-aws-lambda-and-python-e32c6cf58f06    
	s3 = boto3.resource('s3')
	zip_obj = s3.Object(bucket, "zip/"+filename)
	buf = io.BytesIO(zip_obj.get()["Body"].read())
	z = zipfile.ZipFile(buf)
	for member_name in z.namelist():
		file_info = z.getinfo(member_name)
		s3.meta.client.upload_fileobj(z.open(member_name), Bucket=bucket, Key='uploads/'+member_name)
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
	daterange = param['range'].split('-')
	yearmonthrange = [dr[:7] for dr in daterange]
	dayrange = [dr[7:] for dr in daterange]
	pRoot = pathlib.Path(EFSMNT)
	# Paths to all desired database files
	selected = []
	for p in pRoot.iterdir():
		yearmonthname = p.parts[-1]
		if (re.fullmatch('^[0-9]{4}_[0-9]{2}$', yearmonthname) is None) or yearmonthname < yearmonthrange[0] or yearmonthname > yearmonthrange[1]:
			continue
		# all per-day folders
		for p2 in p.iterdir():
			dayname = p2.parts[-1]
			if (yearmonthname == yearmonthrange[0] and dayname < dayrange[0]) or (yearmonthname == yearmonthrange[1] and dayname > dayrange[1]):
				# we are on a cap-range month, and the day is too early or too late
				continue
			# all database files
			for p3 in p2.iterdir():
				selected.append(p3)
	if len(selected) == 0:
		return {'statusCode':200, 'body':'{"download":null}'}
	zipname = 'export_{}_{}_{:05X}.zip'.format(daterange[0], daterange[1], random.randrange(16**5))
	zippath = EFSMNT+"/"+zipname
	zipremote = 'private/'+zipname
	with zipfile.ZipFile(zippath, mode='w') as zfp:
		for db in selected:
			zfp.write(db, arcname='/'.join(db.resolve().parts[-3:]))
	s3 = boto3.client('s3')
	s3.upload_file(zippath, bucket, zipremote, ExtraArgs={'ContentType':'application/zip'})
	subprocess.run(['rm', zippath])
	presigned = s3.generate_presigned_url('get_object', Params={'Bucket':bucket, 'Key':zipremote}, ExpiresIn=3600)
	# Clean up anything that has aged out
	oldObjList = s3.list_objects_v2(
		Bucket = bucket,
		Prefix = 'private/export_',
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

def delete_data_older(param):
	global EFSMNT
	datelimit = param['before']
	# TODO
	
def data_usage():
	usage = subprocess.run(['du', '--human-readable', '--summarize', EFSMNT], capture_output=True).stdout.decode('UTF-8')
	return {
		'statusCode': 200,
		'body': json.dumps({"usage":usage})
	}

def lambda_handler(event, context):
#	try:
		assert isinstance(os.environ['accessKey'], str) and len(os.environ['accessKey']) > 10 , "accessKey improperly configured"
		# Authenticate
		bodyjson = json.loads(event['body'])
		if(bodyjson['accessKey'] != os.environ['accessKey']):
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
		elif(bodyjson['operation'] == 'prepare_data_export'):
			return prepare_data_export(event['queryStringParameters'], os.environ['bucket'])
		elif(bodyjson['operation'] == 'data_usage'):
			return data_usage()
		elif(bodyjson['operation'] == 'test_login'):
			return {'statusCode': 200, 'body':'{}'}
		else:
			return { 'statusCode': 404, 'body': 'unknown operation' }
#	except:
#		return { 'statusCode': 500, 'body': '{}'}


