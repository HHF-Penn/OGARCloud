import time
import boto3
import deploy_funcs
import sys

sess = deploy_funcs.getSession()
s3 = sess.resource('s3')

files = [
'gallery.html',
'manage.html',
'ogar.js',
'ogarclouddeployment.js',
'gl/world.frag',
'gl/world.vert',
'res/audio.svg',
'res/left-click.svg',
'res/pause.svg',
'res/play.svg'
]

mime = {
"html":"text/html",
"svg":"image/svg+xml",
"wasm":"application/wasm",
"js":"text/javascript",
"frag":"text/plain",
"vert":"text/plain"
}


def uploadFile(local, remote, bucket):
	time.sleep(1)
	extension = local.split(".")[-1]
	mtype = mime[extension]
	s3.meta.client.upload_file(local, bucket, remote, ExtraArgs={'ContentType': mtype});
def uploadAll(bucket):
	for f in files:
		uploadFile('s3direct/'+f, f, bucket)
	

if __name__ == '__main__':
	if len(sys.argv) > 2:
		f = sys.argv[2]
		bucket = sys.argv[1]
		print(f)
		uploadFile(f,f,bucket)
	else:
		print('USAGE: <bucketid> <file to upload>
		#uploadAll(bucket)
