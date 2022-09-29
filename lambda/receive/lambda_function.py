import json
import time
import datetime
import random
import uuid
import subprocess
import struct
import sqlite3
import io
import os
import string
import re

EFSMNT = '/mnt/collect'
INITTIME = datetime.datetime.now(datetime.timezone.utc)
DAYSEC = INITTIME.hour*3600 + INITTIME.minute*60 + INITTIME.second
DIRPATH = '{}/{}_{:02d}/{:02d}'.format(EFSMNT, INITTIME.year, INITTIME.month, INITTIME.day)

# Random seed. UUID4 is used here: https://docs.aws.amazon.com/lambda/latest/dg/services-elasticache-tutorial.html
# This method was chosen because I wanted to make sure that my ignorance of lambda /dev/random behavior didn't get in the way of getting a random seed for multiple instances started in the same second.
random.seed(random.randbytes(5) + uuid.uuid4().bytes)

# FIXME test for exclusivity and recreate UID? Maybe use some master multi-access database to atomically query and write the id first?
UID = '{:05d}_{:08X}'.format(DAYSEC, random.randrange(16**8))
SQLITEPATH = '{}/{}.sqlite3'.format(DIRPATH, UID)

# Make our sqlite directory
subprocess.run(['mkdir','-p', DIRPATH], check=True)
# Connect to our new database
dbconn = sqlite3.connect(SQLITEPATH, isolation_level='DEFERRED', check_same_thread=False)
dbcursor = dbconn.cursor()
dbcursor.executescript('''
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
''');

# On prepared statements: https://bugs.python.org/issue12993
regQString = "INSERT INTO participant (id,gallery,client_milli,server_milli,ip) VALUES (?,?,?,?,?);"
posQString = "INSERT INTO pos (id,milli,x,y,yaw,pitch) VALUES (?,?,?,?,?,?);"
perfQString = "INSERT INTO perf (id,milli,dfps,dtime,ifps,itime) VALUES (?,?,?,?,?,?);"
evtQString = "INSERT INTO evt (id,milli,msg) VALUES (?,?,?);"
def numericId(textId):
	return int(textId.split('_')[1])
def registerNew(j, ip):
	global dbcursor,regQString
	galleryID = re.sub(('[^'+string.ascii_letters+string.digits+']'), '_', j['gallery'])
	dbcursor.execute(regQString, (j['id'],galleryID,j['tOrigin'],int(time.time()*1000),ip))
def recordEvents(j):
	global dbcursor,posQString,perfQString,evtQString
	tOrigin = j['tOrigin']
	iden = numericId(j['id'])
	if 'pos' in j:
		pos = j['pos']
		milli = pos['milli']
		x = pos['x']
		y = pos['y']
		yaw = pos['yaw']
		pitch = pos['pitch']
		dbcursor.executemany(posQString,
			[(iden, tOrigin+milli[i], x[i], y[i], yaw[i], pitch[i]) for i in range(len(milli))])
	if 'perf' in j:
		perf = j['perf']
		milli = perf['milli']
		dfps = perf['dfps']
		dtime = perf['dtime']
		ifps = perf['ifps']
		itime = perf['itime']
		dbcursor.executemany(perfQString,
			[(iden, tOrigin+milli[i], dfps[i], dtime[i], ifps[i], itime[i]) for i in range(len(milli))])
	if 'evt' in j:
		evt = j['evt']
		milli = evt['milli']
		msg = evt['msg']
		dbcursor.executemany(evtQString,
			[(iden, tOrigin+milli[i], msg[i].strip()[:150]) for i in range(len(milli))])

GOOD_RESPONSE = {'statusCode':200,'body':json.dumps({'id':UID})}
SERVER_ERROR_RESPONSE = {'statusCode':500,'body':'{}'}
def lambda_handler(event, context):
	global UID, GOOD_RESPONSE, SERVER_ERROR_RESPONSE, dbconn
	bodyjson = json.loads(event['body'])
	if 'register' in bodyjson:
		ip = "unknown"
		try:
			ip = event['requestContext']['identity']['sourceIp']
		except:
			pass
		registerNew(bodyjson, ip)
	else:
		recordEvents(bodyjson)
	dbconn.commit()
	return GOOD_RESPONSE
