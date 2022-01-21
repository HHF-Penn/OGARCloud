import time
import deploy_funcs
import uploads3res
import pickle

state = {}
try:
	with open('state.pickle', 'rb') as fp:
		state = pickle.load(fp)
except:
	print("No state found")

def saveState(s):
	with open('state.pickle', 'wb') as fp:
		pickle.dump(s, fp)



# Create Lambda Roles
roles = None

if "roles" in state:
	roles = state['roles']
	print("loaded lambda roles")
else:
	roles = deploy_funcs.createLambdaRoles()
	print("Created lambda roles")
	state['roles'] = roles
	saveState(state)
	time.sleep(10)

# Create S3 Bucket
bucketName = None
if "bucketName" in state:
	bucketName = state["bucketName"]
	print("loaded bucketName")
else:
	bucketName = deploy_funcs.createBucket(roles)
	print("Created S3 bucket")
	state["bucketName"] = bucketName
	saveState(state)
	time.sleep(10)

# Create VPC and Subnets
vpc = None
if 'vpc' in state:
	vpc = state['vpc']
	print('loaded vpc')
else:
	vpc = deploy_funcs.createVPC()
	print("Created vpc and subnets")
	state['vpc'] = vpc
	saveState(state)
	time.sleep(10)
subnetIds = [s['Subnet']['SubnetId'] for s in vpc[1]]
assert len(subnetIds) > 0

# Create S3 Access Point [UNNEEDED]
# deploy_funcs.createS3AP(bucketName, vpc[0])
# print('Created s3 vpc accesspoint')
# time.sleep(10)

# Create VPC Endpoint to S3 AP
s3VpcEp = None
if 's3vpcep' in state:
	s3VpcEp = state['s3vpcep']
	print('loaded s3vpcep')
else:
	s3VpcEp = deploy_funcs.createS3VPCEndpoint(vpc[0])
	print('Created vcp endpoint linked to s3AP')
	state['s3vpcep'] = s3VpcEp
	saveState(state)
	time.sleep(10)

# Create Security Group
secGrp = None
if 'secGrp' in state:
	secGrp = state['secGrp']
	print('loaded secGrp')
else:
	secGrp = deploy_funcs.createSecurityGroup(vpc[0])
	print('created secGrp')
	state['secGrp'] = secGrp
	saveState(state)
	time.sleep(2)

# Create EFS
fsRet = None
if 'fsRet' in state:
	fsRet = state['fsRet']
	print('loaded fsRet')
else:
	fsRet = deploy_funcs.createEFS(subnetIds, secGrp)
	print('Created EFS')
	state['fsRet'] = fsRet
	saveState(state)
	print('EFS prov. takes a long time. waiting 90 sec. FIXME poll')
	time.sleep(90)
fs = fsRet['fs']
fsAParn = fsRet['AParn']


# Create Lambdas
lambdas = None
if 'lambdas' in state:
	lambdas = state['lambdas']
	print('loaded lambdas')
else:
	lambdas = deploy_funcs.createLambdas(roles, bucketName, subnetIds, secGrp, fsAParn)
	print('Created Lambdas')
	state['lambdas'] = lambdas
	saveState(state)
	time.sleep(10)

# Create APIGateway
gateway = None
if 'gateway' in state:
	gateway = state['gateway']
	print('loaded gateway')
else:
	gateway = deploy_funcs.createGateway(lambdas)
	print('Created API Gateway')
	state['gateway'] = gateway
	saveState(state)
	time.sleep(10)

# Write ogarclouddeployment.js
with open('s3direct/ogarclouddeployment.js', 'wb') as fp:
	fp.write('var ogarcloud_endpoint = "{}/";\n'.format(gateway['ApiEndpoint']).encode('UTF-8'))
	fp.write('var ogarcloud_bucket = "https://{}.s3.{}.amazonaws.com/";\n'.format(bucketName, deploy_funcs.getRegion()).encode('UTF-8'))
print('wrote ogarclouddeployment.js')

# Upload static files to S3
uploads3res.uploadAll(bucketName)
print('uploaded static files to s3')
