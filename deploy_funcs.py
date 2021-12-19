import json
import sys
import time
import base64
import random
import boto3 as boto

AWSSESS = None
AWSCRED = None
DEPLOYMENT = random.randrange(100000)

def getSession():
	global AWSSESS
	if AWSSESS is None:
		cred = getCredentials()
		AWSSESS = boto.session.Session(**cred)
		eprint('got session ({}) for {} in {}'.format(AWSSESS, cred['aws_access_key_id'], cred['region_name']))
	return AWSSESS

def getCredentials():
	global AWSCRED
	if AWSCRED is None:
		try:
			with open('cred.json.secret') as fp:
				AWSCRED = json.load(fp)
		except:
			eprint('Failed to load credentials')
		assert 'aws_access_key_id' in AWSCRED
		assert 'aws_secret_access_key' in AWSCRED
		if 'region_name' not in AWSCRED:
			AWSCRED['region_name'] = 'us-east-1'
	return AWSCRED

def getRegion():
	return getCredentials()['region_name']

def getDeployment():
	global DEPLOYMENT
	return "{:05d}".format(DEPLOYMENT)

def getBucketName():
	return "ogarcloud-{}".format(getDeployment())

def createLambdaRoles():
	sess = getSession()
	iam = sess.resource('iam')
	deploy = getDeployment()
	res = {}
	common = {
		'Tags':[{'Key':'ogarDeployment','Value':deploy}],
		'AssumeRolePolicyDocument':json.dumps({
			'Version':'2012-10-17',
			'Statement':[
				{
					"Effect":"Allow",
					"Principal":{"Service":['lambda.amazonaws.com']},
					"Action":"sts:AssumeRole"
				}
			]
		}),
		'Path':'/ogarcloud-{}/'.format(deploy)
	}
	res['contentAdm'] = iam.create_role(**common, RoleName='contentAdm-{}'.format(deploy), Description='Used to manage available gallery definitions')
	time.sleep(1)
	res['dataWriter'] = iam.create_role(**common, RoleName='dataWriter-{}'.format(deploy), Description='Records experiment data')
	time.sleep(1)
	res['dataReader'] = iam.create_role(**common, RoleName='dataReader-{}'.format(deploy), Description='Prepares experiment results for export')
	time.sleep(1)
	res['contentAdm'].attach_policy(PolicyArn='arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole')
	time.sleep(1)
	res['dataWriter'].attach_policy(PolicyArn='arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole')
	time.sleep(1)
	res['dataReader'].attach_policy(PolicyArn='arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole')
	for k in res:
		res[k] = res[k].arn
	eprint("Created Roles: {}".format(str(res)))
	return res

def createLambdas(roles):
	sess = getSession()
	lamb = sess.client('lambda')
	deploy = getDeployment()
	tags = {'ogarDeployment':deploy}
	zipdat = b''
	with open('lambda/listGalleries.zip', 'rb') as fp:
		zipdat = fp.read() # base64.b64encode(fp.read()).decode('utf-8')
	ret = {}
	ret['listGalleries'] = lamb.create_function(FunctionName='listGalleries-{}'.format(deploy), Publish=True, Timeout=3, MemorySize=128, PackageType='Zip', Code={'ZipFile':zipdat}, Role=roles['contentAdm'], Environment={'Variables':{}}, Tags=tags, Runtime='python3.9', Handler='lambda_function.lambda_handler')#, Architectures=['arm64'])
	time.sleep(10)
	lamb.add_permission(FunctionName='listGalleries-{}'.format(deploy), StatementId='1', Action='lambda:invokeFunction', Principal='apigateway.amazonaws.com')
	return ret

def createGateway(lambdas):
	sess = getSession()
	deploy = getDeployment()
	gwy = sess.client('apigatewayv2')
	ret = gwy.create_api(
		CorsConfiguration = {
			'AllowMethods': ['GET', 'PUT'],
			'AllowOrigins': ['*']
		},
		Description = 'Gateway used by all OGARCloud Lambdas',
		Name = 'ogarcloud-{}'.format(deploy),
		ProtocolType = 'HTTP',
		Tags = {'ogarDeployment':deploy}
	)
	time.sleep(5)
	gwy.create_stage(ApiId = ret['ApiId'], AutoDeploy = True, StageName = '$default')
		#DefaultRouteSettings = {'ThrottlingBurstLimit':10000, 'ThrottlingRateLimit':10000},
	time.sleep(5)

	integration = gwy.create_integration(ApiId=ret['ApiId'], Description='', IntegrationMethod='GET', IntegrationType='AWS_PROXY', IntegrationUri=lambdas['listGalleries']['FunctionArn'], PayloadFormatVersion='2.0', TimeoutInMillis=30000)

	time.sleep(5)

	gwy.create_route(ApiId=ret['ApiId'], AuthorizationType='NONE', RouteKey='GET /listgalleries', Target='integrations/{}'.format(integration['IntegrationId']))
	return ret
		

def createBucket(roles):
	assert roles is not None
	sess = getSession()
	deploy = getDeployment()
	region = getRegion()
	s3 = sess.resource('s3')
	bName = getBucketName()
	s3.create_bucket(Bucket=bName, ACL='private', CreateBucketConfiguration={'LocationConstraint': region})
	b = s3.Bucket(bName)
	b_policy = b.Policy()
	bucketPolicy = {
		"Version":"2012-10-17",
		"Statement":[
			{
			'Sid':'1',
			'Effect':'Allow',
			'Principal':{'AWS':'*'},
			'Action':'s3:GetObject',
			'Resource':'arn:aws:s3:::{}/*'.format(bName),
			},
			{
			'Sid':'2',
			'Effect':'Allow',
			'Principal':{'AWS':roles['contentAdm']},
			'Action':['s3:PutObject','s3:DeleteObject'],
			'Resource':'arn:aws:s3:::{}/*'.format(bName),
			}
		]
	}
	eprint("Policy: {}".format(bucketPolicy))
	b_policy.put(Policy=json.dumps(bucketPolicy))
	b_tagging = b.Tagging()
	b_tagging.put(Tagging={'TagSet':[{'Key':'ogarDeployment','Value':deploy}]})
	eprint('created bucket {}'.format(bName))
	return bName


def eprint(*args, **kwargs):
	print(*args, file=sys.stderr, **kwargs)

eprint("DEPLOYMENT KEY: {}".format(getDeployment()))
