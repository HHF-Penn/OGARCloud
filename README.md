# OGARCloud
OGARCloud is a system built on AWS which allows for a unified, highly-available platform for using OGAR in internet-based research. In brief, it performs five services:

- Allows researchers to upload and preview galleries created with OGAREdit.
- Aids researchers to integrate uploaded OGAR galleries into Qualtrics (Working with a different platform? Contact us.)
- Serves static resources (such as floorplans, images, audio, etc) to participants' web-browsers.
- Collects movement and action data as participants navigate the gallery environment.
- Exports collected data for analysis.

This repository contains the resources and code to launch an instance of OGARCloud.

## Deployment Quick-Guide
You must have AWS API access to an account having these permission policies:

- IAMFullAccess
- AmazonS3FullAccess
- AmazonAPIGatewayAdministrator
- AmazonVPCFullAccess
- AmazonElasticFileSystemFullAccess
- AWSLambda\_FullAccess

Copy `cred.json.template` to `cred.json.secret` and fill in the KEY\_ID and ACCESS\_KEY according to your API Access.

Run `python3 deploy.py` (Read the comments in `deploy.py` for more information)

If you run into issues, delete the created `state.pickle` file to start a new deployment from scratch.

## Architecture Description
OGARCloud uses the following AWS services:

### S3
S3 is used to store uploaded galleries (for researcher preview or public access), data exports, and the management console resources.

### EFS
EFS is used to store collected data. The data is stored as a collection of SQLite3 files.

### Lambda
Lambda functions perform all researcher- and public-facing actions. They interact with S3 and EFS.

### VPC
A VPC is required to connect Lambda and EFS.

### APIGateway
An APIGateway is used to convert HTTP requests to Lambda invocations.

