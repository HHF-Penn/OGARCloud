import aiohttp
import json
import asyncio
import time
import random
import sys

RANDOMTIMES = [random.uniform(-0.015, 0.015) for x in range(2048)]
RANDOMTIMEIDX = 0
TOTALMSG = 0
FAILMSG = 0
TARGETURL = None

if len(sys.argv) < 2:
	print("Running in test-mode. Specify a receptor url to test")
else:
	TARGETURL = sys.argv[1]


def rndTimeOff():
	global RANDOMTIMES, RANDOMTIMEIDX
	RANDOMTIMEIDX = (RANDOMTIMEIDX + 1) % 2048
	return RANDOMTIMES[RANDOMTIMEIDX]

def msTime():
	return time.time_ns()//1000000

class OgarFakeClient:
	def __init__(self):
		self.sess = aiohttp.ClientSession()
		self.id = 'STRESS_{:012d}'.format(random.randrange(1000000000000))
		self.cleanedup = False
		#self.jsonenc = json.JSONEncoder(separators=(',',':'))
		self.tOrigin = msTime()
		self.x = 0.0
		self.y = 0.0
		self.pitch = 0.0
		self.yaw = 0.0
		self.evt_ = {}
		self.perf_ = {}
		self.pos_ = {}
		self.reset()
	def reset(self):
		self.tOrigin = msTime()
		self.evt_['milli'] = []
		self.evt_['msg'] = []
		self.perf_['milli'] = []
		self.perf_['dfps'] = []
		self.perf_['ifps'] = []
		self.perf_['dtime'] = []
		self.perf_['itime'] = []
		self.pos_['milli'] = []
		self.pos_['x'] = []
		self.pos_['y'] = []
		self.pos_['pitch'] = []
		self.pos_['yaw'] = []
	async def introduce(self):
		await self.sendmsg({'id':self.id, 'tOrigin':msTime(), 'gallery':'none, stresstest'})
	async def cleanup(self):
		if self.cleanedup:
			return
		print('cleaning up')
		self.evt('cleanup')
		await self.send()
		await self.sess.close()
		self.cleanedup = True
	async def send(self):
		msg = {'tOrigin':self.tOrigin, 'id':self.id}
		if len(self.pos_['milli']) > 0:
			msg['pos'] = self.pos_
		if len(self.perf_['milli']) > 0:
			msg['perf'] = self.perf_
		if len(self.evt_['milli']) > 0:
			msg['evt'] = self.evt_
		await self.sendmsg(msg)
		self.reset()
	async def sendmsg(self, msg):
		global TOTALMSG, TARGETURL, FAILMSG
		TOTALMSG += 1
		if TARGETURL != None:
			try:
				resp = await self.sess.post(TARGETURL, json=msg)
				code = resp.status
				if code != 200:
					FAILMSG += 1
					print(code)
					try:
						dat = await resp.read()
						print("response body:",dat)
					except Exception as e:
						print("failed to get response body on failure:",e)
			except Exception as e:
				print("sess.post failed: ",e)
		else:
			print(json.dumps(msg))
			await asyncio.sleep(1)
	def pos(self, x, y, pitch, yaw):
		self.pos_['milli'].append(msTime()-self.tOrigin)
		self.pos_['x'].append(x)
		self.pos_['y'].append(y)
		self.pos_['pitch'].append(pitch)
		self.pos_['yaw'].append(yaw)
	def perf(self, dfps, ifps, dtime, itime):
		self.perf_['milli'].append(msTime()-self.tOrigin)
		self.perf_['dfps'].append(dfps)
		self.perf_['ifps'].append(ifps)
		self.perf_['dtime'].append(dtime)
		self.perf_['itime'].append(itime)
	def e(self, msg):
		self.evt('E:'+msg)
	def evt(self, msg):
		self.evt_['milli'].append(msTime()-self.tOrigin)
		self.evt_['msg'].append(msg)
	def simulateMove(self, time):
		self.x += random.uniform(-0.1, 0.1)
		self.y += random.uniform(-0.1, 0.1)
		self.pitch += random.uniform(-0.1, 0.1)
		self.yaw += random.uniform(-0.1, 0.1)
	async def loop(self, sec_duration, sec_delay, idx = None):
		await asyncio.sleep(sec_delay)
		start_time = time.time()
		if idx != None:
			print("{: 5d} - starttime: {}".format(idx ,start_time))
		await self.introduce()
		await asyncio.gather(
			self.posloop(start_time+sec_duration),
			self.perfloop(),
			self.sendloop()
		)
	async def posloop(self, endtime):
		self.e("test error")
		while(time.time() < endtime):
			if random.random() < 0.1: #1 in 10 odds
				self.evt("sample event")
			self.pos(self.x, self.y, self.pitch, self.yaw)
			self.simulateMove(0.2)
			await asyncio.sleep(0.2+rndTimeOff())
		await self.cleanup()
	async def perfloop(self):
		while not self.cleanedup:
			self.perf(60, 60, 0.01, 0.01)
			await asyncio.sleep(1.0+rndTimeOff())
	async def sendloop(self):
		last_time = time.time()
		while not self.cleanedup:
			await self.send()
			await asyncio.sleep(10.0+rndTimeOff() - (time.time()-last_time))
			last_time = time.time()

# Create a pool of `count_clients` OgarFakeClient instances.
# Create these clients over `sec_ramp` seconds.
# Hold full load for `sec_full` seconds.
# Each client will stay alive for `sec_ramp`+`sec_full` seconds (as in a musical round)
async def poolStress(count_clients, sec_ramp, sec_full):
	clients = [OgarFakeClient() for idx in range(count_clients)]
	inter_client_delay = sec_ramp / count_clients
	client_duration = sec_ramp + sec_full
	loops = [clients[cidx].loop( sec_duration = client_duration, sec_delay = cidx*inter_client_delay, idx = cidx) for cidx in range(count_clients)]
	await asyncio.gather(*loops)
	print("Done")

asyncio.run(poolStress(count_clients=200, sec_ramp=120, sec_full=180))
#asyncio.run(poolStress(count_clients=50, sec_ramp=60, sec_full=120))
print("Message Count:", TOTALMSG)
print("Message Failures:", FAILMSG)
