import time
import deploy_funcs

#roles = deploy_funcs.createLambdaRoles()
# Delay between operations
#time.sleep(10)

roles = {'contentAdm':'arn:aws:iam::010887523939:role/ogarcloud-03267/contentAdm-03267',
	'dataWriter':'arn:aws:iam::010887523939:role/ogarcloud-03267/dataWriter-03267',
	'dataReader':'arn:aws:iam::010887523939:role/ogarcloud-03267/dataReader-03267'
}


# Create our S3 bucket
#bucketName = deploy_funcs.createBucket(roles)
#time.sleep(10)

bucketName = 'ogarcloud-03267'

lambdas = deploy_funcs.createLambdas(roles)
time.sleep(10)

# Create our API Gateway
gateway = deploy_funcs.createGateway(lambdas)

#time.sleep(10)

# Create our gallery management lambdas
#deploy_funcs.createMgmtLambdas(roles, bucketName)

# Create our RDBS

# Create our client action recording lambdas

