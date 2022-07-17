import hashlib
import sys

if len(sys.argv) != 4:
	print("Usage: generateHashKey.py <pass> <pepper> <output file>")
	sys.exit()
with open(sys.argv[3], 'wb') as fp:
	fp.write(hashlib.scrypt(password=sys.argv[1].encode('UTF-8'), salt=sys.argv[2].encode('UTF-8'), n=16384, r=8, p=1))
