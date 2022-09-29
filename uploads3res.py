import time
import boto3
import deploy_funcs
import sys

sess = deploy_funcs.getSession()
s3 = sess.resource('s3')

files = [
'gallery.html',
'manage.html',
'ogarcloud_process.zip',
'ogar.js',
'ogarclouddeployment.js',
'gl/world.frag',
'gl/world.vert',
'res/audio.svg',
'res/50x50noise.png',
'res/left-click.svg',
'res/pause.svg',
'res/play.svg',
'private/accessKeyHash.bin',
'tutorial/ogarclouddatacollection.jpg',
'tutorial/ogarcloudprocess.jpg',
'tutorial/ogarcloudsidebar.jpg',
'tutorial/ogarcloudupload.jpg',
'tutorial/ogareditgalleryinterface.jpg',
'tutorial/ogareditimagefolder.jpg',
'tutorial/ogareditimageinterface.jpg',
'tutorial/ogareditselectwall.jpg',
'tutorial/ogareditui.jpg',
'tutorial/ogareditwallcurator.jpg',
'tutorial/ogartutorial.html'
]

mime = {
"html":"text/html",
"svg":"image/svg+xml",
"wasm":"application/wasm",
'zip':'application/zip',
"js":"text/javascript",
"frag":"text/plain",
"vert":"text/plain",
"jpg":"image/jpeg",
"png":"image/png",
"bin":"application/octet-stream"
}


def uploadFile(local, remote, bucket):
	time.sleep(1)
	extension = local.split(".")[-1]
	mtype = mime[extension]
	s3.meta.client.upload_file(local, bucket, remote, ExtraArgs={'ContentType': mtype, 'CacheControl':'no-cache'});
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
		print('USAGE: <bucketid> <file to upload>')
		#uploadAll(bucket)
