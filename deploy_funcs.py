import json
import sys
import os
import time
import random
import string
import boto3 as boto

AWSSESS = None
AWSCRED = None
ACCTID = None
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
			secretPath = os.path.join(os.path.split(os.path.abspath(__file__))[0], 'cred.json.secret')
			with open(secretPath) as fp:
				AWSCRED = json.load(fp)
		except:
			eprint('Failed to load credentials')
		assert 'aws_access_key_id' in AWSCRED
		assert 'aws_secret_access_key' in AWSCRED
		if 'region_name' not in AWSCRED:
			AWSCRED['region_name'] = 'us-east-1'
	return AWSCRED
def getAccountId():
	global ACCTID
	if ACCTID is None:
		sess = getSession()
		ACCTID = sess.client('sts').get_caller_identity()['Account']
	return ACCTID

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
	res['contentAdm'] = iam.create_role(**common, RoleName='oc-contentAdm-{}'.format(deploy), Description='Used to manage available gallery definitions and export recorded data.')
	time.sleep(1)
	res['contentAdm'].attach_policy(PolicyArn='arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole')
	time.sleep(0.5)
	res['contentAdm'].attach_policy(PolicyArn='arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole')
	time.sleep(1)
	res['recorder'] = iam.create_role(**common, RoleName='oc-recorder-{}'.format(deploy), Description='Records experiment data.')
	time.sleep(1)
	res['recorder'].attach_policy(PolicyArn='arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole')
	time.sleep(0.5)
	res['recorder'].attach_policy(PolicyArn='arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole')
	time.sleep(1)
	for k in res:
		res[k] = res[k].arn
	eprint("Created Roles: {}".format(str(res)))
	return res
def createSecurityGroup(vpcId):
	sess = getSession()
	ec2 = sess.client('ec2')
	deploy = getDeployment()
	sg = ec2.create_security_group(Description="Group of lambda funcs and other resources", GroupName="ogarcloud-lmb-{}".format(deploy), VpcId=vpcId)
	# Authorize all egress is already default
#	ec2.authorize_security_group_egress(GroupId=sg['GroupId'], IpPermissions=[
#		{'FromPort':1,'ToPort':65535,'IpProtocol':'-1','IpRanges':[{'CidrIp':'0.0.0.0/0'}]}
#	])
	ec2.authorize_security_group_ingress(GroupId=sg['GroupId'], IpPermissions=[
		{'FromPort':1,'ToPort':65535,'IpProtocol':'-1','IpRanges':[{'CidrIp':'10.0.0.0/16', 'Description':'VPC local ingress'}]}
	])
	return sg['GroupId']
def createLambdas(roles, bucket, subnetIds, secGrp, efsAParn):
	envVariables = {'accessKey':''.join([random.choice(string.digits + string.ascii_lowercase) for i in range(16)]),'bucket':bucket}
	print("Environment variables: "+json.dumps(envVariables))
	sess = getSession()
	lamb = sess.client('lambda')
	deploy = getDeployment()
	tags = {'ogarDeployment':deploy}
	vpcConfig = {'SubnetIds':subnetIds, 'SecurityGroupIds':[secGrp]}
	fsConfigs = [{'Arn':efsAParn,'LocalMountPath':'/mnt/collect'}]
	galleryzipdat = b''
	receivezipdat = b''
	with open('lambda/receive.zip', 'rb') as fp:
		receivezipdat = fp.read()
	with open('lambda/gallery.zip', 'rb') as fp:
		galleryzipdat = fp.read()
	ret = {}
	ret['galleryOp'] = lamb.create_function(FunctionName='galleryOp-{}'.format(deploy), Publish=True, Timeout=25, MemorySize=768, PackageType='Zip', Code={'ZipFile':galleryzipdat}, Role=roles['contentAdm'], Environment={'Variables':envVariables}, VpcConfig=vpcConfig, Tags=tags, FileSystemConfigs=fsConfigs, Runtime='python3.9', Handler='lambda_function.lambda_handler')#, Architectures=['arm64'])
	time.sleep(10)
	ret['receive'] = lamb.create_function(FunctionName='receive-{}'.format(deploy), Publish=True, Timeout=10, MemorySize=128, PackageType='Zip', Code={'ZipFile':receivezipdat}, Role=roles['recorder'], Environment={'Variables':{}}, VpcConfig=vpcConfig, Tags=tags, FileSystemConfigs=fsConfigs, Runtime='python3.9', Handler='lambda_function.lambda_handler')#, Architectures=['arm64'])
	time.sleep(10)
	lamb.add_permission(FunctionName='galleryOp-{}'.format(deploy), StatementId='1', Action='lambda:invokeFunction', Principal='apigateway.amazonaws.com')
	time.sleep(2)
	lamb.add_permission(FunctionName='receive-{}'.format(deploy), StatementId='1', Action='lambda:invokeFunction', Principal='apigateway.amazonaws.com')
	return ret

def createGateway(lambdas):
	sess = getSession()
	deploy = getDeployment()
	gwy = sess.client('apigatewayv2')
	ret = gwy.create_api(
		CorsConfiguration = {
			'AllowMethods': ['GET', 'PUT', 'POST', 'HEAD', 'OPTIONS'],
			'AllowOrigins': ['https://*'],
			'AllowHeaders': ['*']
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

	integration = gwy.create_integration(ApiId=ret['ApiId'], Description='Gallery Management Endpoint', IntegrationMethod='GET', IntegrationType='AWS_PROXY', IntegrationUri=lambdas['galleryOp']['FunctionArn'], PayloadFormatVersion='2.0', TimeoutInMillis=30000)

	time.sleep(5)

	gwy.create_route(ApiId=ret['ApiId'], AuthorizationType='NONE', RouteKey='POST /gallery', Target='integrations/{}'.format(integration['IntegrationId']))
	
	time.sleep(5)

	integration = gwy.create_integration(ApiId=ret['ApiId'], Description='Experiment Data Collection Endpoint', IntegrationMethod='GET', IntegrationType='AWS_PROXY', IntegrationUri=lambdas['receive']['FunctionArn'], PayloadFormatVersion='2.0', TimeoutInMillis=10000)

	time.sleep(5)

	gwy.create_route(ApiId=ret['ApiId'], AuthorizationType='NONE', RouteKey='POST /receive', Target='integrations/{}'.format(integration['IntegrationId']))
	return ret

def createVPC():
	sess = getSession()
	deploy = getDeployment()
	region = getRegion()
	ec2 = sess.client('ec2')
	vpc = ec2.create_vpc(CidrBlock='10.0.0.0/16', TagSpecifications=[{'ResourceType':'vpc','Tags':[{'Key':'Name','Value':'vpc_'+deploy}]}])
	vpcId = vpc['Vpc']['VpcId']
	time.sleep(10)
	# Create subnets
	subnets = []
	try:
		for z in [('10.0.0.0/20', region+'a'),('10.0.16.0/20', region+'b'),('10.0.32.0/20', region+'c')]:
			subnets.append(ec2.create_subnet(VpcId=vpcId, AvailabilityZone=z[1], CidrBlock=z[0]))
			time.sleep(2)
	except:
		pass
	return (vpcId, subnets)

def createS3AP(bucketName, vpcId):
	sess = getSession()
	s3c = sess.client('s3control')
	accountId = getAccountId()
	deploy = getDeployment()
	s3ap = s3c.create_access_point(AccountId=accountId, Name='oc_s3ap_'+deploy, Bucket=bucketName, VpcConfiguration={'VpcId':vpcId}, PublicAccessBlockConfiguration={'BlockPublicAcls':True,'IgnorePublicAcls':True,'BlockPublicPolicy':True,'RestrictPublicBuckets':True})
	return s3ap['AccessPointArn']

def createS3VPCEndpoint(vpcId):
	sess = getSession()
	region = getRegion()
	ec2 = sess.client('ec2')
	routeTableId = ec2.describe_route_tables(Filters=[{'Name':'vpc-id', 'Values':[vpcId]}])['RouteTables'][0]['RouteTableId']
	return ec2.create_vpc_endpoint(VpcEndpointType='Gateway', VpcId=vpcId, ServiceName='com.amazonaws.{}.s3'.format(region), RouteTableIds=[routeTableId])

def createEFS(subnetIds, secGrp):
	sess = getSession()
	deploy = getDeployment()
	efs = sess.client('efs')
	fs = efs.create_file_system(PerformanceMode='generalPurpose', ThroughputMode='bursting', Tags=[{'Key':'Name','Value':'efs-'+deploy}])
	time.sleep(5)
	# Mount Target
	for sni in subnetIds:
		efs.create_mount_target(FileSystemId=fs['FileSystemId'], SubnetId=sni, SecurityGroups=[secGrp])
		time.sleep(1)
	# Access Point
	ap = efs.create_access_point(FileSystemId=fs['FileSystemId'], PosixUser={'Uid':5000,'Gid':5000}, RootDirectory={
		'Path':'/db',
		'CreationInfo':{'OwnerUid':5000,'OwnerGid':5000,'Permissions':'0770'}
	})
	return {'fs':fs,'AParn':ap['AccessPointArn']}

def createBucket(roles):
	assert roles is not None
	sess = getSession()
	deploy = getDeployment()
	region = getRegion()
	s3 = sess.resource('s3')
	bName = getBucketName()
	bArn = 'arn:aws:s3:::{}'.format(bName)
	s3.create_bucket(Bucket=bName, ACL='private', CreateBucketConfiguration={'LocationConstraint': region})
	# Bucket policy
	time.sleep(1)
	b = s3.Bucket(bName)
	b_policy = b.Policy()
	bucketPolicy = {
		"Version": "2012-10-17",
		"Statement": [
			{
			"Sid": "1",
			"Effect": "Allow",
			"Principal": {"AWS": "*"},
			"Action": "s3:GetObject",
			"NotResource": [bArn+"/private/*", bArn]
			},{
			"Sid": "2",
			"Effect": "Allow",
			'Principal':{'AWS':roles['contentAdm']},
			"Action": ["s3:PutObject","s3:ListBucket","s3:DeleteObject","s3:GetObject"],
			"Resource": [bArn+"/*", bArn]
			}
		]
	}
	eprint("Policy: {}".format(bucketPolicy))
	b_policy.put(Policy=json.dumps(bucketPolicy))
	time.sleep(1)
	# Cors Config
	time.sleep(1)
	b_cors = b.Cors()
	b_cors.put(CORSConfiguration={'CORSRules':
	[{
		"AllowedHeaders": ["*"],
		"AllowedMethods": ["GET","PUT","POST","HEAD","DELETE"],
		"AllowedOrigins": ["https://*"],
		"ExposeHeaders": []
	}]});
	# Tagging
	b_tagging = b.Tagging()
	b_tagging.put(Tagging={'TagSet':[{'Key':'ogarDeployment','Value':deploy}]})
	eprint('created bucket {}'.format(bName))
	return bName


def eprint(*args, **kwargs):
	print(*args, file=sys.stderr, **kwargs)

eprint("DEPLOYMENT KEY: {}".format(getDeployment()))
