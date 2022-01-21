let isQual = false;
var OGARgallery;
var ogar_intervals;
var QualtricsThis;
if(typeof Qualtrics !== 'undefined'){
	isQual = true;
	Qualtrics.SurveyEngine.addOnload(function(){});
	Qualtrics.SurveyEngine.addOnReady(function(){
		QualtricsThis = this;
		ogar_omnibus_func();
	});
	let cleanupFunc = function(){
		OGARgallery.recep.cleanup();
		for(const inv of ogar_intervals){
			clearInterval(inv);
		}
	}
	Qualtrics.SurveyEngine.addOnPageSubmit(cleanupFunc);
	Qualtrics.SurveyEngine.addOnUnload(cleanupFunc);
}


function ogar_omnibus_func(){
"use strict";
var GalleryOpts = {
	"BaseWidth":800,
	"BaseHeight":450,
	"FullWidth":1600,
	"FullHeight":900,
	"FragShader":"gl/world.frag",
	"VertShader":"gl/world.vert",
	"ResourceDir":"res/",
	"ArtSolidColor":false,
	"ReceptorAddr":""/*@@ReceptorAddr@@*/,
	"GalleryPathOverride":""/*@@GalleryPathOverride@@*/,
	"GalleryDataRoot":""/*@@GalleryDataRoot@@*/,
	"GalleryID":""/*@@GalleryID@@*/
};

// Enable or disable the 'next' button in qualtrics
function nextButtonInterface(enable){
	if(!isQual) return;
	if(enable){
		QualtricsThis.enableNextButton();
	}else{
		QualtricsThis.disableNextButton();
	}
}
nextButtonInterface(false);

if (!window.requestPostAnimationFrame) {
//	window.requestPostAnimationFrame = window.requestAnimationFrame;
	window.requestPostAnimationFrame = function(task) {
		requestAnimationFrame(() => {
			setTimeout(task, 0);
		});
	}
}

const EPSILON = 0.005;

// Handle URL Option overrides
if(!isQual){
	const urlParams = new URLSearchParams(window.location.search);
	Object.keys(GalleryOpts).forEach(function(k){
		if(urlParams.has(k)){
			GalleryOpts[k] = urlParams.getAll(k)[0];
		}
	});
}

// This div becomes fullscreen and adopts whatever size it is given
var fsDiv = document.createElement("div");
fsDiv.style.setProperty("background-color", "#202020");
fsDiv.style.setProperty("display", "flex");
fsDiv.style.setProperty("align-items", "center");
fsDiv.style.setProperty("justify-content", "center");
fsDiv.style.setProperty("width", GalleryOpts["BaseWidth"]+"px");
fsDiv.style.setProperty("height", GalleryOpts["BaseHeight"]+"px");

// This div provides a non-flexbox context to facilitate canvas overlapping 
var containerDiv = document.createElement("div");
containerDiv.style.setProperty("width", "100%");
containerDiv.style.setProperty("height", "100%");
containerDiv.style.setProperty("position", "relative");

// Create two overlapping canvases
var overlayCanv = document.createElement("canvas");
overlayCanv.id = "OGAROverlayCanvas";
overlayCanv.width = GalleryOpts["FullWidth"];
overlayCanv.height = GalleryOpts["FullHeight"];
overlayCanv.style.setProperty("width", "100%");
overlayCanv.style.setProperty("height", "100%");
overlayCanv.style.setProperty("object-fit", "contain");
overlayCanv.style.setProperty("position", "absolute");
overlayCanv.style.setProperty("z-index", "6");
//overlayCanv.style.setProperty("image-rendering", "crisp-edges");
//overlayCanv.style.setProperty("image-rendering", "pixelated");
var glCanv = document.createElement("canvas");
glCanv.id = "OGARGlCanvas";
glCanv.width = GalleryOpts["FullWidth"];
glCanv.height = GalleryOpts["FullHeight"];
glCanv.style.setProperty("width", "100%");
glCanv.style.setProperty("height", "100%");
glCanv.style.setProperty("object-fit", "contain");
glCanv.style.setProperty("position", "absolute");
glCanv.style.setProperty("z-index", "3");
//glCanv.style.setProperty("image-rendering", "crisp-edges");
//glCanv.style.setProperty("image-rendering", "pixelated");
// And an overlapping div for labels
var labelDiv = document.createElement("div");
labelDiv.id = "OGARLabelDiv";
labelDiv.style.setProperty("visibility", "hidden");
labelDiv.style.setProperty("object-fit", "contain");
labelDiv.style.setProperty("position", "absolute");
labelDiv.style.setProperty("white-space", "pre-wrap");
labelDiv.style.setProperty("font-family", "\"Fira Sans\", sans-serif");
labelDiv.style.setProperty("z-index", "9");
var audioPlayerDiv = document.createElement("div");
audioPlayerDiv.style.setProperty("visibility", "hidden");
audioPlayerDiv.style.setProperty("object-fit", "contain");
audioPlayerDiv.style.setProperty("position", "absolute");
audioPlayerDiv.style.setProperty("background", "#FFFFFF");
audioPlayerDiv.style.setProperty("opacity", "0.5");
audioPlayerDiv.style.setProperty("padding", "8pt");
audioPlayerDiv.style.setProperty("z-index", "15");
fsDiv.append(containerDiv);
containerDiv.append(glCanv);
containerDiv.append(overlayCanv);
containerDiv.append(labelDiv);
containerDiv.append(audioPlayerDiv);

var QID = 'ANON';

if(isQual){
	var qid = QualtricsThis.questionId;
	var qdiv = document.getElementById(qid);
	console.log(qdiv);
	qdiv.prepend(fsDiv);
	var temp = function(){return ('0000'+Math.floor(Math.random()*10000)).slice(-4);};
	QID = "Q_"+temp()+temp()+temp();
	Qualtrics.SurveyEngine.setEmbeddedData('Cust_UniqueID', QID);
}else{
	var temp = function(){return ('0000'+Math.floor(Math.random()*10000)).slice(-4);};
	QID = "TEST_"+temp()+temp()+temp();
	document.body.appendChild(fsDiv);
}
var ctx = overlayCanv.getContext('2d');
ctx.textAlign = "center";
ctx.textBaseline = "middle";
ctx.font = "40px sans-serif";
function drawLoading(msg){
	ctx.fillStyle = "#88A0C0";//slate grey background
	ctx.fillRect(0,0,overlayCanv.width,overlayCanv.height);
	ctx.fillStyle = "#000000";
	ctx.fillText(msg, overlayCanv.width/2, overlayCanv.height/2);
}
drawLoading("Loading...");
console.log("QID: ",QID);


var gallerydefpath = (GalleryOpts.GalleryPathOverride == "") ? "gallery.json" : GalleryOpts.GalleryPathOverride;

class MessageReportBundler{
	constructor(addr, id, galleryid, sec){
		this.addr = addr;
		this.id = id;
		this.cleanedup = false;
		this.evt_ = {};
		this.perf_ = {};
		this.pos_ = {};
		this.reset();
		this.introduce(galleryid);
		this.interval = setInterval(this.send.bind(this), sec*1000);
	}
	reset(){
		this.tOrigin = Date.now();
		this.evt_['milli'] = [];
		this.evt_['msg'] = [];
		this.perf_['milli'] = [];
		this.perf_['dfps'] = [];
		this.perf_['ifps'] = [];
		this.perf_['dtime'] = [];
		this.perf_['itime'] = [];
		this.pos_['milli'] = [];
		this.pos_['x'] = [];
		this.pos_['y'] = [];
		this.pos_['pitch'] = [];
		this.pos_['yaw'] = [];
	}
	introduce(galleryid){
		const msg = {
			"id":this.id,
			"tOrigin":this.tOrigin,
			"gallery":galleryid
		};
		this.sendmsg(msg);
	}
	send(){
		const msg = {};
		if(this.pos_['milli'].length > 0){
			msg['pos'] = this.pos_;
		}
		if(this.perf_['milli'].length > 0){
			msg['perf'] = this.perf_;
		}
		if(this.evt_['milli'].length > 0){
			msg['evt'] = this.evt_;
		}
		msg['tOrigin'] = this.tOrigin;
		msg['id'] = this.id;
		this.sendmsg(msg);
		this.reset();
	}
	cleanup(){
		if(!this.cleanedup){
			this.evt('cleanup');
			clearInterval(this.interval);
			this.send();
			this.cleanedup = true;
		}
	}
	sendmsg(msg){
		if(this.addr == ""){
			console.log(JSON.stringify(msg));
		}else{
			fetch(this.addr, {method:'POST',mode:'cors',headers:{'Content-Type':'application/json'},body:JSON.stringify(msg),referrerPolicy:'no-referrer'}).then(function(response){
				if(!response.ok){
					this.e('POST FAILED');
				}
			}.bind(this));
		}
	}
	// Position
	pos(x,y,pitch,yaw){
		this.pos_['milli'].push(Date.now()-this.tOrigin);
		this.pos_['x'].push(Math.round(x*1000)/1000);
		this.pos_['y'].push(Math.round(y*1000)/1000);
		this.pos_['pitch'].push(Math.round(pitch*1000)/1000);
		this.pos_['yaw'].push(Math.round(yaw*1000)/1000);
	}
	// Performance
	perf(dfps, ifps, dtime, itime){
		this.perf_['milli'].push(Date.now()-this.tOrigin);
		this.perf_['dfps'].push(dfps);
		this.perf_['ifps'].push(ifps);
		this.perf_['dtime'].push(Math.round(dtime*1000)/1000);
		this.perf_['itime'].push(Math.round(itime*1000)/1000);
	}
	// Error
	e(msg){
		this.evt('E:'+msg);
	}
	// Event
	evt(msg){
		console.log("evt: "+msg);
		this.evt_['milli'].push(Date.now()-this.tOrigin);
		this.evt_['msg'].push(msg);
	}
}
const E = new MessageReportBundler(GalleryOpts["ReceptorAddr"], QID, GalleryOpts["GalleryID"], 10);
E.evt("epoch");
//A small class to handle required resources
class recursiveLoader{
	load(path, type, onload, absolute){
		var realpath;
		if(absolute){
			realpath = path;
		}else{
			realpath = this.rpath+path;
		}
		const metaonload = function(data){
			if(this.alreadyLoaded.has(data)){
				return;
			}
			this.alreadyLoaded.add(data);
			this.leftToLoad--;
			if(onload != null) onload(path, data, this.leftToLoad, this.max);
			if(this.leftToLoad == 0){
				this.onallload();
			}else if(this.leftToLoad < 0){
				E.e("recursiveloader lefttoload < 0");
			}
		}.bind(this);
		if(type == 'JSON'){
			fetch(realpath)
				.then(response => response.json())
				.then(data => metaonload(data));
		}else if(type == 'IMG'){
			var i = new Image();
			i.addEventListener("load", function(){metaonload(i)});
			i.crossOrigin = "anonymous";
			i.src = realpath;
		}else if(type == 'AUDIO'){
			var a = new Audio();
			a.addEventListener("canplaythrough", function(){metaonload(a)});
			a.crossOrigin = "anonymous";
			a.controls = true;
			a.preload = "auto";
			a.src = realpath;
		}else if(type == 'TEXT'){
			fetch(realpath)
				.then(response => response.text())
				.then(data => metaonload(data));
		}else if(type == 'WS'){
			console.log("Loading "+realpath);
			var ws = new WebSocket(realpath);
			ws.onopen = function(){metaonload(ws)};
			ws.onerror = function(){console.error("Failed to load WS: "+realpath); metaonload(null);}
		}
	}

	constructor(rpath){
		this.rpath = rpath;
		this.onallload = null;
		this.loadStack = [];
		this.leftToLoad = 0;
		this.started = false;
		// This is used to prevent nasty behavior if any of the 'load' callbacks get triggered more than once (this can be a problem with the audio loading)
		this.alreadyLoaded = new Set();
		this.max = 0;//used for loading status
	}

	addTarget(path, type, onload, absolute=false){
		this.max++;
		if(this.started){
			this.leftToLoad++;
			this.load(path, type, onload, absolute);
		}else{//otherwise add it to the left-to
			this.leftToLoad++;
			this.loadStack.push({"path":path, "type":type, "onload":onload, "absolute":absolute});
		}
	}

	start(){
		this.started = true;
		var me = this;
		this.loadStack.forEach(l => {
			me.load(l.path, l.type, l.onload, l.absolute);
		});
	}
}

const PI1_2 = Math.PI/2.0;
function isPowerOfTwo(x) {//from khronos group
	return (x & (x - 1)) == 0;
}

function nextHighestPowerOfTwo(x) {//from khronos group
	--x;
	for (var i = 1; i < 32; i <<= 1) {
		x = x | x >> i;
	}
	return x + 1;
}
function cross(res, a, b){
	res[0]=a[1]*b[2]-a[2]*b[1];
	res[1]=a[2]*b[0]-a[0]*b[2];
	res[2]=a[0]*b[1]-a[1]*b[0];
}
function rotate(v, r){
	var s = Math.sin(r);
	var c = Math.cos(r);
	return [v[0]*c - v[1]*s, v[0]*s + v[1]*c];
}
function dot(a, b){
	var res = 0;
	for(var idx = a.length-1; idx >= 0; idx--){
		res += a[idx]*b[idx];
	}
	return res;
}
function norm(v){
	let len = Math.hypot.apply(null, v);
	if(len == 0.0){
		return v;//Everything was zeros
	}
	len = 1/len;
	return v.map(i => i * len);
}
function distance2(x1, y1, x2, y2){
	return Math.hypot(x1-x2, y1-y2);
}
function linePointDistance(line, pt){
	const dx1 = pt[0] - line[0];
	const dx2 = pt[0] - line[2];
	const dy1 = pt[1] - line[1];
	const dy2 = pt[1] - line[3];
	const v = norm([line[2]-line[0], line[3]-line[1]]);
	const v1 = norm([dx1, dy1]);
	const v2 = norm([dx2, dy2]);
	const a1 = Math.acos(v1[0]*v[0] + v1[1]*v[1]);
	const a2 = Math.acos(v2[0]*v[0] + v2[1]*v[1]);
	if((a1 <= PI1_2) && (a2 >= PI1_2)){
		// We can project onto the line, so the distance is the rightangle distance.
		var dist = Math.hypot(dx1, dy1);
		// distance * dot product of the vector to the point and a vector orthogonal to the line
		return dist * Math.abs(v1[0]*(-v[1]) + v1[1]*v[0]);
	}else{
		// We can't project onto the line, so the distance is the distance to the closest end point.
		return Math.min(Math.hypot(dx1, dy1), Math.hypot(dx2, dy2));
	}
}
// Modification of "Tomas Mo''ller and Ben Trumbore _Fast, minimum storage ray/triangle intersection_" to intersect with a parallelogram where v0 is between v1 and v2 on the edge
function intersect_quad(pt, dir, v0, v1, v2){
	const EPSILON = 0.00001;
	// Find vectors for two edges sharing vert0
	const edge1 = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
	const edge2 = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
	// Begin calculating determinant - also used to calculate U parameter
	const pvec = [0,0,0];
	cross(pvec, dir, edge2);
	// If determinant is near zero, ray lies in plane of triangle
	const det = dot(edge1, pvec);
	// The non-culling branch
	if(det > -EPSILON && det < EPSILON){
		return null;
	}
	const inv_det = 1.0/det;
	// Calculate distance from vert0 to ray origin
	const tvec = [pt[0]-v0[0], pt[1]-v0[1], pt[2]-v0[2]];
	// Calculate U parameter and test bounds
	const u = dot(tvec, pvec) * inv_det;
	if(u < 0 || u > 1){
		return null;
	}
	// Prepare to test V parameter
	const qvec = [0,0,0];
	cross(qvec, tvec, edge1);
	// Calculate V parameter and test bounds
	const v = dot(dir, qvec) * inv_det;
	if(v < 0 || v > 1){ // original is u+v > 1 here. This expands the valid area into a parallelogram mirrored across from v0
		return null;
	}
	// Calculate t, ray intersects triangle
	const t = dot(edge2, qvec) * inv_det;
	if(t < 0){
		return null;
	}
	return t;
}
class Mat4{
	constructor(arr=null){
		if(arr){
			this.arr = arr;
		}else{
			this.arr = [];
			this.setTo(Mat4.idenMat); //default to identity matrix
		}
	}
	setTo(other){
		for(var i = 0; i < 16; i++){
			this.arr[i] = other.arr[i];
		}
	}
	// Multiplies a matrix by a 4x1 vector, and saves the result in the vector
	multVec(vec){
		const res = Mat4.tempVec;
		var m1 = this.arr;
		for(var y = 0; y < 4; y++){
			var v = 0.0;
			for(var i = 0; i < 4; i++){
				v += m1[y+4*i] * vec[i];
			}
			res[y] = v;
		}
		for(var i = 0; i < 4; i++){
			vec[i] = res[i];
		}
	}
	// Multiplies a matrix by another, and saves the result in _this_
	mult2(mat1, mat2){
		var res = this.arr;
		var m1 = mat1.arr;
		var m2 = mat2.arr;
		for(var x = 0; x < 4; x++){
			for(var y = 0; y < 4; y++){
				var v = 0.0;
				for(var i = 0; i < 4; i++){
					v += m1[y+4*i]*m2[i+4*x];
				}
				res[y+4*x] = v;
			}
		}
	}
	// Multiplies _this_ by another matrix, and save the result in _this_
	mult(other){
		for(var x = 0; x < 4; x++){
			for(var y = 0; y < 4; y++){
				var v = 0;
				for(var i = 0; i < 4; i++){
					v += this.arr[y+4*i]*other.arr[i+4*x];
				}
				Mat4.tempMat.arr[y+4*x] = v;
			}
		}
		this.setTo(Mat4.tempMat);
	}
	trans(x, y, z){
		var r = this.arr;
		r[12] += x;
		r[13] += y;
		r[14] += z;
	}
	//https://www.khronos.org/registry/OpenGL-Refpages/gl2.1/xhtml/gluPerspective.xml
	gluPerspective(fovy, aspect, zNear, zFar){
		var f = 1.0/Math.tan(fovy/2.0);
		var m = this.arr;
		m[0] = f/aspect;
		m[1] = 0;m[2] = 0;m[3] = 0;m[4] = 0;
		m[5] = f;
		m[6] = 0;m[7] = 0;m[8] = 0;m[9] = 0;
		m[10] = (zFar+zNear)/(zNear-zFar);
		m[11] = -1;
		m[12] = 0;m[13] = 0;
		m[14] = (2.0*zFar*zNear)/(zNear-zFar);
		m[15] = 0;
	}
	//modified from https://www.khronos.org/registry/OpenGL-Refpages/gl2.1/xhtml/gluLookAt.xml
	glhLookAtf2(center3D, upVector3D){
		var side = [0,0,0];
		var up = [0,0,0];
		// --------------------
		// Side = forward x up
		cross(side, center3D, upVector3D);
		norm(side);
		// Recompute up as: up = side x forward
		cross(up, side, center3D);
		// --------------------
		this.arr[0] = side[0];
		this.arr[4] = side[1];
		this.arr[8] = side[2];
		// --------------------
		this.arr[1] = up[0];
		this.arr[5] = up[1];
		this.arr[9] = up[2];
		// --------------------
		this.arr[2] = -center3D[0];
		this.arr[6] = -center3D[1];
		this.arr[10] = -center3D[2];
		// --------------------
		this.arr[3] = this.arr[7] = this.arr[11] = this.arr[12] = this.arr[13] = this.arr[14] = 0.0;
		this.arr[15] = 1.0;
	}
	static zRot(r){
		var s = Math.sin(r);
		var c = Math.cos(r);
		Mat4.zRotMat.arr[0] = c;
		Mat4.zRotMat.arr[1] = s;
		Mat4.zRotMat.arr[4] = -s;
		Mat4.zRotMat.arr[5] = c;
		return Mat4.zRotMat;
	}
	static translate(x, y, z){
		Mat4.transMat.arr[12] = x;
		Mat4.transMat.arr[13] = y;
		Mat4.transMat.arr[14] = z;
		return Mat4.transMat;
	}
}
Mat4.idenMat = new Mat4([1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0]);
Mat4.tempMat = new Mat4();
Mat4.tempVec = [0.0, 0.0, 0.0, 0.0];
Mat4.zRotMat = new Mat4();
Mat4.transMat = new Mat4();

Mat4.lookatMat2 = new Mat4();
Mat4.lookatResultMat = new Mat4();

class Mat3{
	constructor(arr=null){
		if(arr){
			this.arr = arr;
		}else{
			this.arr = [];
			this.setTo(Mat3.idenMat); //default to identity matrix
		}
	}
	setTo(other){
		for(var i = 0; i < 9; i++){
			this.arr[i] = other.arr[i];
		}
	}
	mult2(mat1, mat2){
		var res = this.arr;
		var m1 = mat1.arr;
		var m2 = mat2.arr;
		for(var x = 0; x < 3; x++){
			for(var y = 0; y < 3; y++){
				var v = 0.0;
				for(var i = 0; i < 3; i++){
					v += m1[y+3*i]*m2[i+3*x];
				}
				res[y+3*x] = v;
			}
		}
	}
	mult(other){
		for(var x = 0; x < 3; x++){
			for(var y = 0; y < 3; y++){
				var v = 0;
				for(var i = 0; i < 3; i++){
					v += this.arr[y+3*i]*other.arr[i+3*x];
				}
				Mat4.tempMat.arr[y+3*x] = v;
			}
		}
		this.setTo(Mat3.tempMat);
	}
	trans(x, y){
		var r = this.arr;
		r[6] += x;
		r[7] += y;
	}
	multvec(x, y){
		var v = [x,y,1];
		var r = [0,0];
		var m = this.arr;
		for(var x = 0; x < 2; x++){//Only 2 because we don't care about the last thing.
			var val = 0;
			for(var y = 0; y < 3; y++){
				val += m[x+3*y]*v[y];
			}
			r[x] = val;
		}
		return r;
	}
	static rot(r){
		var s = Math.sin(r);
		var c = Math.cos(r);
		Mat3.rotMat.arr[0] = c;
		Mat3.rotMat.arr[1] = s;
		Mat3.rotMat.arr[3] = -s;
		Mat3.rotMat.arr[4] = c;
		return Mat3.rotMat;
	}
	static translate(x, y){
		Mat3.transMat.arr[6] = x;
		Mat3.transMat.arr[7] = y;
		return Mat3.transMat;
	}
}
Mat3.idenMat = new Mat3([1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]);
Mat3.tempMat = new Mat3();
Mat3.rotMat = new Mat3();
Mat3.transMat = new Mat3();

/*
 * A utility class to help manage audio states and separate them from main game logic
 */
class Jukebox{
	constructor(evtRecorder){
		// an audio element
		this.loaded = null;
		this.coord = [null,null,null,null];
	}
	// Load an audio file. Doesn't start playing
	slotIn(aud, coords = [null,null,null,null]){
		if((aud == this.loaded && coords[0] == this.coord[0] && coords[1] == this.coord[1] && coords[2] == this.coord[2] && coords[3] == this.coord[3]) || aud == null){
			return;
		}
		E.evt("JB load");
		if(this.loaded != null){
			this.unslot();
		}
		this.loaded = aud;
		this.coord = coords;
	}
	unslot(){
		if(this.loaded != null){
			E.evt("JB unload");
			this.reset();
			this.loaded = null;
		}
	}
	getSlotted(){
		return this.loaded;
	}
	getTime(){
		if(this.loaded == null){
			return 0;
		}
		return this.loaded.currentTime;
	}
	getPaused(){
		if(this.loaded == null){
			return true;
		}
		return this.loaded.paused;
	}
	unslotIfFurtherThan(distance, cx, cy){
		if(this.loaded != null && linePointDistance(this.coord, [cx, cy]) > distance){
			E.evt("JB over-distance unload");
			this.unslot();
		}
	}
	reset(){
		if(this.loaded != null){
			this.pause();
			this.loaded.currentTime = 0;
		}
	}
	togglePlay(){
		if(this.loaded != null){
			if(this.loaded.paused){
				this.play();
			}else{
				this.pause();
			}
		}
	}
	play(){
		if(this.loaded != null){
			E.evt("JB play");
			this.loaded.play();
		}
	}
	pause(){
		if(this.loaded != null){
			E.evt("JB pause");
			this.loaded.pause();
		}
	}
}

class Keyboard{
	constructor(){
		this.k = {"up":false, "down":false, "left":false, "right":false, "lt":false, "gt":false, "i":false, "k":false};
	}
	clear(){
		const k = this.k;
		Object.keys(k).forEach(function(keyName){
			k[keyName] = false;
		});
	}
	getMovementVector(viewAngle){
		var v = [0, 0];
		if(this.k["up"]) v[0]+=1.0;
		if(this.k["down"]) v[0]-=1.0;
		if(this.k["right"]) v[1]-=1.0;
		if(this.k["left"]) v[1]+=1.0;
		return norm(rotate(v, viewAngle));
	}
}
class Gallery{//FIXME art tex dims should be in by 0.5, not 1
	constructor(galleryDiv, j, images, audios, recep, qid){
		E.e("Test Error");
		this.myKeyboard = new Keyboard();
		this.recep = recep;
		this.j = j;
		this.processWalls();
		console.log("Wall segments: "+this.wallCount+" Unique Images: "+Object.keys(this.j["art"]).length+" Image Instances: "+this.j["artPlacement"].length);
		this.images = images;
		this.audios = audios;
		this.state = {"name":"S_INACTIVE"};
		// The audio target needs to be separate from state (because it is affected by user movements) and lookingAt (because it can persist between looking at multiple artworks)
		this.jukebox = new Jukebox();
		this.lookingAt = null;
		// This is used by Gallery.collide to cache some collision data // FIXME if we put all our collision wall segments in a single array, then we can have a nice buffer that sorts line segments based on their lower-bound distance.
		this.collideCache = {
				// A sub-meter accounting of distance travelled, a la Bresenham
				partialDist : 0.0,
				// This sets the granularity (more granular is nicer, because it spreads out intensive computations more finely). 10 is decimeter granularity
				distMult : 10,
				// How many units away (lower bounded) is each wall? if it is less than our per-tick travel distance, plus our radius (typically '0'), then calculate the real distance and process potential collisions
				distances : new Int32Array(this.wallCount)
		};
		this.debugmode = false;
		this.galleryDiv = galleryDiv;
		this.glCanvas = galleryDiv.querySelector("#OGARGlCanvas");
		this.overlayCanvas = galleryDiv.querySelector("#OGAROverlayCanvas");
		this.labelDiv = galleryDiv.querySelector("#OGARLabelDiv");
		//frustum z planes
		this.zplanes = new Float32Array([0.05, 200]);
		//lens matrix
		this.cam_lens = new Mat4();
		this.cam_lens.gluPerspective(1.2, this.glCanvas.width/this.glCanvas.height, this.zplanes[0], this.zplanes[1]);//vfov was 1.22
		console.log(""+this.cam_lens.arr);
		//translation
		this.cam_trs = new Mat4();
		//cam pointing direction
		this.cam_rot = new Mat4();
		this.col_refFrame = new Mat3();
		this.col_ptRefFrame = new Mat3();
		this.col_rotationMat = new Mat3();
		this.redraw = true;
		this.wallH = j["wallHeight"];
		var wallH = this.wallH;

		this.getArtDefinitions(j["art"]);
		this.overlay = this.overlayCanvas.getContext("2d");
		const glHints = {
			alpha: false,
			stencil: false,
			antialias: false,
		//	desynchronized: true,
		}
		var gl = this.glCanvas.getContext("webgl2", glHints);
		if(gl === null){
			E.evt("webgl2 not supported");
			gl = this.glCanvas.getContext("webgl", glHints);
			if(gl === null){
				E.e("Browser incompatible with WebGL.");
				return;
			}else{
				E.evt("Got webgl1 context");
			}
		}else{
			E.evt("Got webgl2 context");
		}
		this.gl = gl;

		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);//FIXME this line shouldnt be copied anywhere
		gl.enable(gl.DEPTH_TEST);
		//gl.enable(gl.CULL_FACE);
		gl.disable(gl.CULL_FACE);
		gl.clearColor(0,0.5,0.5,1);
		this.loadTex(images);
		E.evt("Finished preparing textures");
		this.createGLWalls();
		E.evt("Finished creating wall triangles");
		this.getArtTriangles(j["artPlacement"]); //add the triangles for the art. This function also adds the arts texture coordinates
		Object.values(this.artDef).forEach( d => {
			d.normals = this.calculateNormals(d.points);
		});
		E.evt("Finished preparing art buffers");
		this.framerate = 60;
		this.invframerate = 1.0/this.framerate;
		this.clickExamine = false;
		if("clickExamine" in j){
			this.clickExamine = j["clickExamine"];
		}
		this.autoplayAudio = false;
		if("autoplayAudio" in j){
			this.autoplayAudio = j["autoplayAudio"];
		}
		this.pl = [j["patron"]["start"][0], j["patron"]["start"][1], j["patron"]["height"]];
		this.pVel = [0,0];
		this.pv = j["patron"]["dir"]/180*Math.PI;
		this.pvVert = 0.0;//straight forward (up/down view angle)
		var me = this;//for lambdas

		function mousemovefunc(e){
			if(me.state["name"] == "S_NAV"){
				me.pv -= e.movementX/500;
				me.pvVert -= e.movementY/500;
				me.limitPlayerView();
				me.redraw = true;
			}
		}
		function keyupfunc(e){
			me.keyboard(event.keyCode, false);
		}
		function keydownfunc(e){
			me.keyboard(event.keyCode, true);
		}
		document.addEventListener('mousemove', mousemovefunc, false);
		document.addEventListener("keydown", keydownfunc);
		document.addEventListener("keyup", keyupfunc);
		galleryDiv.addEventListener('fullscreenchange', function(){
			if(document.fullscreenElement == galleryDiv){
				me.stateEvent("GAIN_FS");
			}else{
				me.stateEvent("LOSE_FS");
			}
			me.redraw = true;
		});
		galleryDiv.addEventListener('fullscreenerror', function(){
			me.stateEvent("ERROR_FS");
		});
		document.addEventListener('pointerlockchange', function(){
			if(document.pointerLockElement == galleryDiv){
				me.stateEvent("GAIN_PL");
			}else{
				me.stateEvent("LOSE_PL");
			}
		});
		document.addEventListener("pointerlockerror", function(){
			me.stateEvent("ERROR_PL");
		});
		galleryDiv.onclick = function(){
			me.stateEvent("CLICK");
		};

		var program;
		program = this.createProgram(vertShader, fragShader);
		this.program = program;
		gl.linkProgram(program);
		if(!gl.getProgramParameter(program, gl.LINK_STATUS)){
			E.e("Program link error: "+gl.getProgramInfoLog(program));
		}
		gl.useProgram(program);
		E.evt("Finished initializing gl program");
		this.addData();
		E.evt("Finished binding gl data buffers");
		this.u_cam_rot = gl.getUniformLocation(program, "u_cam_rot");
		this.u_cam_trs = gl.getUniformLocation(program, "u_cam_trs");
		this.u_cam_lens = gl.getUniformLocation(program, "u_cam_lens");
		gl.uniformMatrix4fv(this.u_cam_lens, false, this.cam_lens.arr);
		this.perfcount_draw = 0;
		this.perftime_draw = 0;
		this.perfcount_iter = 0;
		this.perftime_iter = 0;
		window.requestAnimationFrame(function(timestamp){me.draw()});
		E.evt("Target draw");
		var intervals = [];
		this.lastIterTime = 0;
		me.gameIterate();
		intervals.push(setInterval(function(){me.sendPos();}, 1000/5));
		intervals.push(setInterval(function(){me.updatePerf();}, 1000));
		ogar_intervals = intervals;
	}
	// Inform the state machine that an action has occurred
	stateEvent(action){
		var handled = false;
		const jb = this.jukebox;
		const trans = function(state, data){
			data["name"] = state;
			this.state = data;
			E.evt(this.state["name"]);
			this.myKeyboard.clear();
			handled = true;
			// All state transitions at least pause audio
			jb.pause();
		}.bind(this);
		const state = this.state["name"];
		const gd = this.galleryDiv;
		if(state == "S_INACTIVE"){
			if(action == "CLICK"){
				trans("S_NAV_PRE_FS", {});
				gd.requestFullscreen();
			}
		}else if(state == "S_NAV_PRE_FS"){
			if(action == "GAIN_FS"){
				trans("S_NAV_PRE_PL", {});
				gd.requestPointerLock();
			}else if(action == "ERROR_FS"){
				trans("S_INACTIVE", {});
				E.e("FS ERROR");
			}
		}else if(state == "S_NAV_PRE_PL"){
			if(action == "GAIN_PL"){
				trans("S_NAV", {});
				nextButtonInterface(true);
			}else if(action == "ERROR_PL"){
				trans("S_EXIT_FS", {});
				E.e("PL ERROR");
				document.exitFullscreen();
			}else if(action == "LOSE_FS"){
				trans("S_EXIT_PL", {});
			}
		}else if(state == "S_NAV"){
			if(action == "CLICK"){
				handled = true;
				if(this.lookingAt != null){
					let viewedAudio = this.lookingAt["art"]["audios"][this.lookingAt["idx"]];
					jb.slotIn(viewedAudio, this.lookingAt["art"]["corners"][this.lookingAt["idx"]]);
					if(this.clickExamine){
						trans("S_EXAMINE_PL", {"target":this.lookingAt});
						document.exitPointerLock();
					}else{
						jb.togglePlay();
					}
				}
			}else if(action == "LOSE_PL"){
				trans("S_EXIT_FS", {});
				document.exitFullscreen();
			}else if(action == "LOSE_FS"){
				trans("S_EXIT_PL", {});
				document.exitPointerLock();
			}
		}else if(state == "S_EXIT_FS"){
			if(action == "LOSE_FS"){
				trans("S_INACTIVE", {});
			}else if(action == "ERROR_FS"){
				trans("S_INACTIVE", {});
			}else if(action == "GAIN_FS"){
				handled = true;
				document.exitFullscreen();
			}
		}else if(state == "S_EXIT_PL"){
			if(action == "LOSE_PL"){
				trans("S_INACTIVE", {});
			}else if(action == "ERROR_PL"){
				trans("S_INACTIVE", {});
			}else if(action == "GAIN_PL"){
				handled = true;
				document.exitPointerLock();
			}
		}else if(state == "S_EXAMINE_PL"){
			if(action == "LOSE_PL"){
				trans("S_EXAMINE", {"target":this.state["target"]});
				if(this.autoplayAudio){
					// Handle examine->autoplay
					jb.play();
				}
				this.drawExamineOverlay();
//			}else if(action == "ERROR_PL"){
//				trans("S_EXAMINE", {"data":this.state["data"]});
			}else if(action == "LOSE_FS"){
				trans("S_EXIT_PL", {});
			}
		}else if(state == "S_EXAMINE"){
			if(action == "CLICK"){
				trans("S_NAV_PRE_PL", {});
				// Any way that we exit examining, we lose our audio progress
				jb.unslot();
				gd.requestPointerLock();
			}else if(action == "LOSE_FS"){
				trans("S_INACTIVE", {});
				jb.unslot();
			}
		}
		if(!handled){
			E.evt("Unhandled "+action+" from "+state);
		}
	}
	updatePerf(){
		this.recep.perf(this.perfcount_draw, this.perfcount_iter, this.perftime_draw/1000, this.perftime_iter/1000);
		this.perfcount_draw = 0;
		this.perftime_draw = 0;
		this.perfcount_iter = 0;
		this.perftime_iter = 0;
	}
	sendPos(){
		this.recep.pos(this.pl[0], this.pl[1], this.pvVert, this.pv);
		if(this.coordPrintDom != null){
			this.coordPrintDom.value = stat["x"]+" "+stat["y"]+" "+stat["pitch"]+" "+stat["yaw"];
		}
	}
	getArtDefinitions(art){ //This takes the 'art' element
		var keys = Object.keys(art);
		this.artDef = {}; //In the form of "monalisa":{"tex":[0.0, 0.0, 0.05, (*9 because of [t1, t2, bias] for each corner)], "dim":[x, y]}. tex is texture coordinates
		var me = this;
		keys.forEach(function (k){
			var a = art[k];
			var t1 = [0.0, 1.0];//FIXME why does this exist??? it is handled in getArtTriangles
			var t2 = [1.0, 1.0];
			var t3 = [0.0, 0.0];
			var t4 = [1.0, 0.0];
			var tex = [].concat(t1,t2,t3,t2,t3,t4);
			me.artDef[k] = {"instanceCount":0, "tex":tex, "size":a["size"], "texCoord":[], "texture":a["texture"], "points":[], "texts":[], "audios":[], "corners":[]};
		});
	}
	getArtTriangles(artInst){//This takes the 'artPlacement' element
		artInst.forEach(function (a){
			var aDef = this.artDef[a["art"]];
			// Record our text information
			let textInfo = null;
			if(Object.keys(a).includes("label")){
				textInfo = {"content":a["label"], "style":a["labelStyle"]};
			}
			aDef["texts"].push(textInfo);
			let audioElem = null;
			if(Object.keys(a).includes("audio")){
				audioElem = this.audios[a["audio"]];
			}
			aDef["audios"].push(audioElem);
			if(-1 == Object.keys(a).findIndex(i => (i == "size"))){
				a["size"] = aDef["size"]; //Put in the default size from the definition if not explicit
			}
			a["size"] = Array.from(a["size"]);
			if(a.hasOwnProperty("scale")){
				a["size"] = a["size"].map(x => x*a["scale"]);
			}
			var c = Array.from(a["loc"]);
			var relLeft = [0, -a["size"][0]/2];
			relLeft = rotate(relLeft, a["dir"]/180*Math.PI);
			// This exists to offset art 1cm from the wall
			var offset = rotate([0.01,0], a['dir']/180*Math.PI);
			c[0] += offset[0];
			c[1] += offset[1];
			var left = [c[0]+relLeft[0], c[1]+relLeft[1]];
			var right = [c[0]-relLeft[0], c[1]-relLeft[1]];
			aDef.corners.push(left.concat(right));
			var bottom = a["height"] - a["size"][1]/2;
			var top = a["height"] + a["size"][1]/2;

			var p1 = [left[0], left[1], bottom];//bottom left
			var p2 = [right[0], right[1], bottom];//bottom right
			var p3 = [left[0], left[1], top];//top left
			var p4 = [right[0], right[1], top];//top right

			aDef.points = aDef.points.concat(p1,p2,p3,p4,p3,p2);
			aDef.texCoord = aDef.texCoord.concat([0,1,1,1,0,0,1,0,0,0,1,1]);//FIXME
			aDef.instanceCount += 1;
		}.bind(this));
	}
	loadTex(images){
		var texStagingCanvas = document.createElement("canvas");
		var gl = this.gl;
		this.gltexture = this.createTextureFromImage(images["__tex"], texStagingCanvas);
		gl.bindTexture(gl.TEXTURE_2D, this.gltexture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

		Object.keys(this.artDef).forEach( function(k, kidx){
			var d = this.artDef[k];
			d.gltexture = this.createTextureFromImage(images[k], texStagingCanvas);
			gl.bindTexture(gl.TEXTURE_2D, d.gltexture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); //This is for things like windows with very small textures.
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR); //This is for paintings where we only see a small portion of their real resolution
		}.bind(this));
	}
	processWalls(){
		var wallCount = 0;
		this.bounds = [0,0,0,0];
		const b = this.bounds;
		this.j["walls"].forEach(i => {
			for(var idx = 0; idx < i.length; idx += 2){
				if(i[idx] < b[0]) b[0] = i[idx];
				if(i[idx] > b[2]) b[2] = i[idx];
				if(i[idx+1] < b[1]) b[1] = i[idx+1];
				if(i[idx+1] > b[3]) b[3] = i[idx+1];
			}
			wallCount += i.length/2 - 1;
		});
		const w = new Float64Array(wallCount*4);
		this.walls = w;
		var wallIdx = 0;
		this.j["walls"].forEach(i => {
			for(var idx = 0; idx+2 < i.length; idx+=2){
				for(var offset = 0; offset < 4; offset++){
					w[wallIdx*4+offset] = i[idx + offset];
				}
				wallIdx++;
			}
		});
		this.wallCount = wallCount;
		this.quadCount = wallCount+2;
		// Free this memory. We have converted into our preferred format
		this.j["walls"] = null;
	}
	createGLWalls(){
		const wallH = this.wallH;
		const quadCount = this.quadCount;
		const b = this.bounds;
		const w = this.walls;
		//Vertex/Normal array
		const vna = new Float32Array(6*6*quadCount);
		//Texture coord array
		const tca = new Float32Array(6*2*quadCount);
		var qidx = 0;
		// Floor and ceiling normals
		var fcNormal = [0,0,1];
		for(var idx = 0; idx < 12; idx++){
			vna.set(fcNormal, 3*idx+18*quadCount);
		}
		// Floor
		vna.set([b[0], b[1], 0, b[2], b[1], 0, b[0], b[3], 0, b[0], b[3], 0, b[2], b[1], 0, b[2], b[3], 0], qidx);
		qidx+=18;
		// Ceiling
		vna.set([b[0], b[1], wallH, b[0], b[3], wallH, b[2], b[1], wallH, b[2], b[1], wallH, b[0], b[3], wallH, b[2], b[3], wallH], qidx);
		qidx+=18;
		for(var idx = 0; idx < w.length; idx+=4){
			var normal = norm([-(w[idx+1]-w[idx+3]), w[idx]-w[idx+2], 0]);
			for(var nIdx = 0; nIdx < 6; nIdx++){
				vna.set(normal, qidx+3*nIdx+18*quadCount);
			}
			var pt1 = [w[idx], w[idx + 1], 0];
			var pt2 = [w[idx + 2], w[idx + 3], 0];
			var pt3 = [w[idx], w[idx + 1], wallH];
			vna.set(pt1, qidx);
			vna.set(pt2, qidx+3);
			vna.set(pt3, qidx+6);
			pt1 = [w[idx + 2], w[idx + 3], wallH];
			vna.set(pt3, qidx+9);
			vna.set(pt2, qidx+12);
			vna.set(pt1, qidx+15);
			qidx += 18;
		}
		const floorTex = [3/8, 0.5];
		const ceilingTex = [5/8, 0.5]
		const wallTex = [1/8, 0.5];
		var tidx = 0;
		for(var idx = 0; idx < 6; idx++){
			tca.set(floorTex, tidx);
			tidx+=2;
		}
		for(var idx = 0; idx < 6; idx++){
			tca.set(ceilingTex, tidx);
			tidx+=2;
		}
		for(var idx = 0; idx < 6*(quadCount-2); idx++){
			tca.set(wallTex, tidx);
			tidx+=2;
		}
		const gl = this.gl;
		this.vbuffer = gl.createBuffer();//Create and bind vertex/normal buffer
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vbuffer);
		gl.bufferData(gl.ARRAY_BUFFER, vna, gl.STATIC_DRAW);

		this.tbuffer = gl.createBuffer();//Create and bind texcoord buffer
		gl.bindBuffer(gl.ARRAY_BUFFER, this.tbuffer);
		gl.bufferData(gl.ARRAY_BUFFER, tca, gl.STATIC_DRAW);
	}
	calculateNormals(pts){
		var normals = [];
		for(var i = 0; i < pts.length; i+=9){
			var a = [0, 0, 0];
			var b = [0, 0, 0];
			for(var d = 0; d < 3; d++){
				a[d] = pts[i+d] - pts[i+d+3];
				b[d] = pts[i+d+3] - pts[i+d+6];
			}
			var n1 = (a[1]*b[2] - a[2]*b[1]); 
			var n2 = (a[2]*b[0] - a[0]*b[2]); 
			var n3 = (a[0]*b[1] - a[1]*b[0]);
			for(var redo = 0; redo < 3; redo++){
				normals.push(n1);
				normals.push(n2);
				normals.push(n3);
			}
		}
		return normals;
	}
	draw(){
		this.perfcount_draw += 1;
		var drawstart = performance.now();
		const me = this;
		//this.redraw = false; //FIXME remove redraw tag
		var gl = this.gl;//FIXME combined setToMult should be faster. FIXME make benchmark
		//this.cam_rot.setTo(Mat4.idenMat);
		const cospv = Math.cos(this.pv);
		const cospvvert = Math.cos(this.pvVert);
		const sinpv = Math.sin(this.pv);
		const sinpvvert = Math.sin(this.pvVert);
		const viewVec = [cospv*cospvvert, sinpv*cospvvert, sinpvvert];
		this.cam_rot.glhLookAtf2(viewVec, [-cospv*sinpvvert, -sinpv*sinpvvert, cospvvert]);
//		this.cam_rot.glhLookAtf2([cospv*cospvvert, sinpv*cospvvert, sinpvvert], [0,0,1]);
		this.cam_trs.setTo(Mat4.translate(-this.pl[0], -this.pl[1], -this.pl[2]));
		gl.uniformMatrix4fv(this.u_cam_rot, false, this.cam_rot.arr);
		gl.uniformMatrix4fv(this.u_cam_trs, false, this.cam_trs.arr);
		this.gl.clear(this.gl.DEPTH_BUFFER_BIT | this.gl.COLOR_BUFFER_BIT);

		gl.bindTexture(gl.TEXTURE_2D, this.gltexture);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vbuffer);
		gl.vertexAttribPointer(this.a_position, 3, gl.FLOAT, false, 0, 0);//0 stride means please calculate for me based on numComponents and type
		gl.vertexAttribPointer(this.a_normal, 3, gl.FLOAT, false, 0, this.quadCount*18*4);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.tbuffer);
		gl.vertexAttribPointer(this.a_texcoord, 2, gl.FLOAT, false, 0, 0);
		gl.drawArrays(gl.TRIANGLES, 0, this.quadCount*6);

		Object.values(this.artDef).forEach(d => {
			gl.bindTexture(gl.TEXTURE_2D, d.gltexture);
			gl.bindBuffer(gl.ARRAY_BUFFER, d.vbuffer);
			gl.vertexAttribPointer(me.a_position, 3, gl.FLOAT, false, 0, 0);//0 stride means please calculate for me based on numComponents and type
			gl.vertexAttribPointer(me.a_normal, 3, gl.FLOAT, true, 0, d.points.length*4);
			gl.bindBuffer(gl.ARRAY_BUFFER, d.tbuffer);
			gl.vertexAttribPointer(me.a_texcoord, 2, gl.FLOAT, false, 0, 0);
			gl.drawArrays(gl.TRIANGLES, 0, d.points.length/3);
		});
		if(this.state["name"] != "S_EXAMINE"){
			// FIXME find a more elegant way to handle the visibility (in transitions?)
			this.labelDiv.style.setProperty("visibility", "hidden");
			audioPlayerDiv.style.setProperty("visibility", "hidden");
			var ctx = this.overlay;
			var ctxW = this.overlayCanvas.width;
			var ctxH = this.overlayCanvas.height;
			ctx.clearRect(0, 0, ctxW, ctxH);
			this.computeLookingAt(viewVec);
			if(this.lookingAt != null){
				if(this.clickExamine){
					var loc = this.lookingAt["art"].points.slice(18*this.lookingAt["idx"] + 3, 18*this.lookingAt["idx"] + 6);
					var screenLoc = this.getScreenLocation(loc);
					var tryLoc = [(1+screenLoc[0])*ctxW/2, (1-screenLoc[1])*ctxH/2];
					// the target corner can be behind the camera for some circumstances.
					if(tryLoc[0]+50 > ctxW || screenLoc[2] <= 0) tryLoc[0] = ctxW-50;
					if(tryLoc[1]+50 > ctxH || screenLoc[2] <= 0) tryLoc[1] = ctxH-50;
					ctx.drawImage(this.images["__left-click"], tryLoc[0], tryLoc[1], 50, 50);
				}else if(this.lookingAt["art"]["audios"][this.lookingAt["idx"]] != null){
					var loc = this.lookingAt["art"].points.slice(18*this.lookingAt["idx"] + 3, 18*this.lookingAt["idx"] + 6);
					var screenLoc = this.getScreenLocation(loc);
					var tryLoc = [(1+screenLoc[0])*ctxW/2, (1-screenLoc[1])*ctxH/2];
					// the target corner can be behind the camera for some circumstances.
					if(tryLoc[0]+100 > ctxW || screenLoc[2] <= 0) tryLoc[0] = ctxW-100;
					if(tryLoc[1]+50 > ctxH || screenLoc[2] <= 0) tryLoc[1] = ctxH-50;
					ctx.drawImage(this.images["__left-click"], tryLoc[0], tryLoc[1], 50, 50);
					if(this.jukebox.getSlotted() == this.lookingAt["art"]["audios"][this.lookingAt["idx"]]){
						// This one is slotted
						if(this.jukebox.getPaused()){
							ctx.drawImage(this.images["__play"], tryLoc[0]+50, tryLoc[1], 50, 50);
						}else{
							ctx.drawImage(this.images["__pause"], tryLoc[0]+50, tryLoc[1], 50, 50);
						}
					}else{
						ctx.drawImage(this.images["__audio"], tryLoc[0]+50, tryLoc[1], 50, 50);
					}
				}
			}
			// ctx.fillRect(ctxW/2-5, ctxH/2-5, 10, 10);
		}
		window.requestPostAnimationFrame(function(timestamp){me.draw()});
		this.perftime_draw += performance.now()-drawstart;
	}
	computeLookingAt(viewVec){
		// Figure out how close the closest wall is, if any
		const collideCache = this.collideCache;
		const clickViewDist = 2.5;
		const clickViewDistMult = clickViewDist * collideCache.distMult;
		let closestCollision = Infinity;
		const walls = this.walls;
		const distArray = collideCache.distances;
		for(let idx = 0; idx < this.wallCount; idx++){
			// FIXME this is actually off (in the safe, but inefficient direction) by our collision radius. See Gallery.collide()
			if(distArray[idx] > clickViewDistMult) continue;
			let w = walls.slice(idx*4, idx*4+4);
			let p1 = [w[0], w[1], 0];
			let p3 = [w[2], w[3], 0];
			let p4 = [w[2], w[3], this.wallH];
			let ret = intersect_quad(this.pl, viewVec, p3, p1, p4);
			if(ret != null && ret < closestCollision){
				closestCollision = ret;
			}
		}
		//
		var viewArt = null;
		// Determine if any artworks are in the view vector closer than the closest wall
		Object.keys(this.artDef).forEach(function(artName){
			var d = this.artDef[artName];
			for(let instanceIdx = 0; instanceIdx < d.instanceCount; instanceIdx++){
				let o = 18*instanceIdx;
				let p1 = d.points.slice(o, o+3);
				let p3 = d.points.slice(o+6, o+9);
				let p4 = d.points.slice(o+9, o+12);
				let ret = intersect_quad(this.pl, viewVec, p3, p1, p4);
				if(ret != null && ret < closestCollision){
					closestCollision = ret;
					viewArt = {"artName": artName, "art":d, "idx":instanceIdx};
				}
			}
		}.bind(this));
		if(viewArt != null && closestCollision < clickViewDist){
			this.lookingAt = viewArt;
		}else{
			this.lookingAt = null;
		}
	}
	getScreenLocation(pt){
		var dat = pt.concat([1.0]);
		this.cam_trs.multVec(dat);
		this.cam_rot.multVec(dat);
		this.cam_lens.multVec(dat);
		return [dat[0]/dat[3], dat[1]/dat[3], dat[2]];
	}
	drawExamineOverlay(){
		var ctx = this.overlay;
		var ctxW = this.overlayCanvas.width;
		var ctxH = this.overlayCanvas.height;
		ctx.fillStyle = "#505050";
		ctx.fillRect(0, 0, ctxW, ctxH);
		var t_artName = this.state["target"]["artName"];
		var t_art = this.state["target"]["art"];
		var t_idx = this.state["target"]["idx"];
		var label = t_art["texts"][t_idx];
		var artBounds = [0, 0, ctxW, ctxH];
		var img = this.images[t_artName];
		var imageAspect = img.width/img.height;
		var containerAspect = containerDiv.clientWidth/containerDiv.clientHeight;
		var targetAspect = GalleryOpts["FullWidth"]/GalleryOpts["FullHeight"];
		//console.log(containerAspect, targetAspect);
		// These scale variables are used to set the width and height of the labeldiv. They are needed to comply with letterboxing.
		var widthScale = 100;
		var heightScale = 100;
		if(containerAspect > targetAspect){
			widthScale *= targetAspect/containerAspect;
		}else{
			heightScale *= containerAspect/targetAspect;
		}
		// Show audio player controls, if appropriate
		const playingAudio = this.jukebox.getSlotted()
		if(playingAudio != null){
			audioPlayerDiv.innerHTML = "";
			audioPlayerDiv.style.setProperty("top", (100-heightScale)/2+"%");
			audioPlayerDiv.style.setProperty("left", (100-widthScale)/2+"%");
			audioPlayerDiv.appendChild(playingAudio);
			audioPlayerDiv.style.setProperty("visibility", "visible");
		}else{
			audioPlayerDiv.style.setProperty("visibility", "hidden");
		}
		if(label != null){
			var labelDiv = this.labelDiv;
			var text = label["content"];
			var style = label["style"];
			var textSide = style["textSide"];
			const margin = 5;
			//console.log(widthScale, heightScale);
			if(textSide == "EAST" || textSide == "WEST"){
				var diff = artBounds[2] * (1/3) + margin;
				artBounds[2] -= diff;
				labelDiv.style.setProperty("height", heightScale+"%");
				labelDiv.style.setProperty("width", widthScale/3+"%");
				labelDiv.style.setProperty("top", (100-heightScale)/2+"%");
				var left = (100-widthScale)/2+widthScale*(2/3);
				if(textSide == "WEST"){
					artBounds[0] += diff;
					left = (100-widthScale)/2;
				}
				labelDiv.style.setProperty("left", left+"%");
			}else if(textSide == "SOUTH" || textSide == "NORTH"){
				var diff = artBounds[3] * (1/3) + margin;
				artBounds[3] -= diff;
				labelDiv.style.setProperty("height", heightScale/3+"%");
				labelDiv.style.setProperty("width", widthScale+"%");
				labelDiv.style.setProperty("left", (100-widthScale)/2+"%");
				var top_ = (100-heightScale)/2+heightScale*(2/3);
				if(textSide == "NORTH"){
					artBounds[1] += diff;
					top_ = (100-heightScale)/2;
				}
				labelDiv.style.setProperty("top", top_+"%");
			}
			var cardDiv = document.createElement("div");
			cardDiv.innerHTML = text;
			cardDiv.style.setProperty("overflow-y", "auto");
			cardDiv.style.setProperty("padding", "5pt");
			cardDiv.style.setProperty("background-color", style["bgColor"]);
			cardDiv.style.setProperty("border", "solid #00000050");
			cardDiv.style.setProperty("box-shadow", "5px 5px 3px #00000040");
			labelDiv.innerHTML = "";
			labelDiv.appendChild(cardDiv);
			// Style all of the included tags
			function styleAll(nodeList, style){
				var fontStyle = "";
				var textDecoration = "";
				if(Object.keys(style).includes("bold") && style["bold"]){
					fontStyle += " bold";
				}
				if(Object.keys(style).includes("underline") && style["underline"]){
					textDecoration += " underline";
				}
				if(Object.keys(style).includes("italic") && style["italic"]){
					fontStyle += " italic";
				}
				var hAlign = {"LEFT":"start", "RIGHT":"end", "CENTER":"center", "JUSTIFIED":"justify"}[style["hAlign"]];
				nodeList.forEach(function(n){
					n.style.setProperty("margin", "0");
					n.style.setProperty("color", style["color"]);
					n.style.setProperty("font-style", fontStyle);
					n.style.setProperty("text-decoration", textDecoration);
					n.style.setProperty("font-size", style["ptFont"]+"pt");
					n.style.setProperty("text-align", hAlign);
				});
			}
			styleAll(labelDiv.querySelectorAll("h1"), style["styles"]["<h1>"]);
			styleAll(labelDiv.querySelectorAll("h2"), style["styles"]["<h2>"]);
			styleAll(labelDiv.querySelectorAll("small"), style["styles"]["<small>"]);
			styleAll(labelDiv.querySelectorAll("div"), style["styles"]["DEFAULT"]);
			var vAlign = "initial";
			if(style["vAlign"] == "CENTER"){
				vAlign = "center";
			}else if(style["vAlign"] == "TOP"){
				vAlign = "start";
			}else if(style["vAlign"] == "BOTTOM"){
				vAlign = "end";
			}
			labelDiv.style.setProperty("display", "flex");
			labelDiv.style.setProperty("flex-direction", "column");
			labelDiv.style.setProperty("justify-content", vAlign);
		//	labelDiv.style.setProperty("background-color", style["bgColor"]);
			labelDiv.style.setProperty("visibility", "visible");
			labelDiv.focus();
			console.log("label:", label);
		}
		var drawIWidth = Math.min(artBounds[2], artBounds[3] * imageAspect);
		var drawIHeight = Math.min(artBounds[3], artBounds[2] / imageAspect);
		ctx.drawImage(this.images[t_artName], artBounds[0] + (artBounds[2]-drawIWidth) / 2, artBounds[1] + (artBounds[3]-drawIHeight) / 2, drawIWidth, drawIHeight);
	}
	collide(start, end){
		const collideCache = this.collideCache;
		const walls = this.walls;
		const distArray = collideCache.distances;
		// Avatar collision circle radius, in meters
		const rad = 0.25;
		const refFrame = this.col_refFrame;
		const ptRefFrame = this.col_ptRefFrame;
		const rotationMat = this.col_rotationMat;
		var iteration = 0;
		//movement vector;
		var mvec = [end[0]-start[0], end[1]-start[1]];
		//the distance of our movement
		var linelen = Math.hypot(mvec[0], mvec[1]);
		collideCache.partialDist += collideCache.distMult*linelen;
		var partialDistFloor = Math.floor(collideCache.partialDist);
		if(partialDistFloor > 0){
			// Update our lowerbound distances
			for(var idx = 0; idx < distArray.length; idx++){
				if(distArray[idx] > 0){
					distArray[idx] -= partialDistFloor;
				}
			}
			collideCache.partialDist -= partialDistFloor;
		}
		//normalized movement vector
		var nmvec = [mvec[0]/linelen, mvec[1]/linelen];
		while(true){
			iteration++;
			rotationMat.setTo(Mat3.rot(-Math.atan2(nmvec[1], nmvec[0])));
			ptRefFrame.mult2(rotationMat, Mat3.translate(-start[0],-start[1]));
			var closestCollision = Infinity;
			// This gets populated with the vector of whatever we hit, so we know which way to redirect
			var collider = null;
			for(var idx = 0; idx < this.wallCount; idx++){
				if(distArray[idx] > 0){
					continue;
				}
				var w = walls.slice(idx*4, idx*4+4);
				if((distArray[idx] = (linePointDistance(w, start) - linelen - rad) * collideCache.distMult) > 0){
					continue;
				}
				var wallvec = norm([w[2]-w[0], w[3]-w[1]]);
				// This is the offset of the point on the circle which might collide with the line
				var rimOffset = [-rad*wallvec[1], rad*wallvec[0]];
				if(dot(rimOffset, nmvec) < 0){ //FIXME we should be able to avoid this (or convert it to a back-face cull early exit?), since we know what sides of walls are outside.
					// rimOffset is actually backwards (facing away from the wall), so flip it
					rimOffset[0] = -rimOffset[0];
					rimOffset[1] = -rimOffset[1];
				}
				refFrame.mult2(rotationMat, Mat3.translate(-(start[0]+rimOffset[0]),-(start[1]+rimOffset[1])));
				var rw1 = refFrame.multvec(w[0],w[1]);//rotated wall points
				var rw2 = refFrame.multvec(w[2],w[3]);
				// This is the vector of the wall from the POV of the avatar's offset movement ray
				var rwv = [rw2[0]-rw1[0],rw2[1]-rw1[1]];
				// This is related to the distance from the x-axis versus the distance this wall travels on the y-axis (see the exit condition, below)
				var rwvmult = -rw1[1]/rwv[1];
				// 'This wall crosses our path'
				if(rwvmult <= 1+EPSILON && rwvmult >= 0-EPSILON){
					var cdist = rw1[0]+rwv[0]*rwvmult;//x intercept
					// 'This wall crosses our path neither behind us, nor too far ahead, and closer than the previous best collision'
					if(cdist >= 0-EPSILON && cdist <= linelen+EPSILON && cdist < closestCollision){
						closestCollision = cdist;
						collider = [wallvec[0], wallvec[1]];
					}
				}
				// Find if we hit either end of this line
				for(var ptIdx = 0; ptIdx < 2; ptIdx++){
					var rw = ptRefFrame.multvec(w[ptIdx*2], w[ptIdx*2+1]);//rotated point
					if(rw[0] < 0 || rw[0] > linelen+rad || rw[1] > rad || rw[1] < -rad) continue;//this point is not in the possible bounding box
					var cdist = rw[0] - rad*Math.sqrt(1-Math.pow(rw[1]/rad,2));
					if(cdist <= linelen && cdist < closestCollision){
						closestCollision = cdist;
						// Find the vector tangent to our corner collision
						collider = norm([-(w[ptIdx*2+1]-(start[1]+nmvec[1]*cdist)), w[ptIdx*2]-(start[0]+nmvec[0]*cdist)]);
					}
				}
			}
			if(collider === null){
				return end;
			}else{
				closestCollision -= EPSILON;
				var remainingmove = linelen-closestCollision;//How much longer we can move after this collision
				var tanvecmag = dot(collider, nmvec);
				var linelen = Math.abs(tanvecmag*remainingmove);
				for(var dim = 0; dim < 2; dim++){
					start[dim] = start[dim]+nmvec[dim]*closestCollision;
					mvec[dim] = tanvecmag*collider[dim]*remainingmove;
					nmvec[dim] = mvec[dim]/linelen;
					end[dim] = start[dim]+mvec[dim];
				}
	//			return end;//This disables iterative handling of the collision, and instead just returns after the first step
				if(remainingmove < EPSILON || iteration >= 4){
					return start;
				}
			}
		}
	}
	gameIterate(){
		this.perfcount_iter += 1;
		var iterstart = performance.now();
		if(this.state["name"] == "S_NAV"){
			var fps = Math.min(60, Math.max(1, 1000/(iterstart - this.lastIterTime)));
			this.lastIterTime = iterstart;
			var moveMult = 1.8 * this.framerate/fps;
			var rotMult = 0.7 * this.framerate/fps;
			var m = this.myKeyboard.getMovementVector(this.pv);
			var accelMult = 5.0 * this.framerate/fps; // inverse of time in seconds to get from still to full speed.
			if(m[0] != 0.0 || m[1] != 0.0){
				var deltaVel = [m[0]-this.pVel[0], m[1]-this.pVel[1]];
				var deltaMag = Math.hypot(deltaVel[0],deltaVel[1]); //This is the size of the difference between our current velocity and our desired velocity
				if(deltaMag > accelMult*this.invframerate){//If we want to do more acceleration than we can, then cap it
					deltaVel = norm(deltaVel).map(x => x*accelMult*this.invframerate);
					this.pVel[0] += deltaVel[0];
					this.pVel[1] += deltaVel[1];
				}else{ //Otherwise, this is within our capabilities, so we set our speed directly to target
					this.pVel[0] = m[0];
					this.pVel[1] = m[1];
				}
			}else{//if we aren't actively moving, stop dead
				this.pVel = [0,0];
			}
			if(this.pVel[0] != 0 || this.pVel[1] != 0){
				this.redraw = true;
				var dest = [this.pl[0]+moveMult*this.pVel[0]*this.invframerate, this.pl[1]+moveMult*this.pVel[1]*this.invframerate, this.pl[2]];//movement initial destination for this frame
				this.pl = this.collide(this.pl, dest);
				if(this.clickExamine == false && this.jukebox.getSlotted() != null){
					this.jukebox.unslotIfFurtherThan(2.5/*FIXME no magic*/, this.pl[0], this.pl[1]);
				}
			}
			if(this.myKeyboard.k["lt"]){
				this.redraw = true;
				this.pv += rotMult*PI1_2*this.invframerate;
			}
			if(this.myKeyboard.k["gt"]){
				this.redraw = true;
				this.pv -= rotMult*PI1_2*this.invframerate;
			}
			if(this.myKeyboard.k["i"]){
				this.redraw = true;
				this.pvVert += 0.05;
			}
			if(this.myKeyboard.k["k"]){
				this.redraw = true;
				this.pvVert -= 0.05;
			}
			this.limitPlayerView();
		}
		const deltaTime = performance.now()-iterstart;
		this.perftime_iter += deltaTime;
		setTimeout(function(){this.gameIterate()}.bind(this), Math.max(0, 1000*this.invframerate-deltaTime));//Make the game progress
	}
	limitPlayerView(){
		while(this.pv < 0){
			this.pv += 2*Math.PI;
		}
		while(this.pv > 2*Math.PI){
			this.pv -= 2*Math.PI;
		}
		//prevent people from looking up or down too much. range 0.0-1.0
		const pvVertLimitMult = 0.55;
		const pvVertLimit = pvVertLimitMult * PI1_2;
		if(this.pvVert > pvVertLimit){
			this.pvVert = pvVertLimit;
		}
		if(this.pvVert < -pvVertLimit){
			this.pvVert = -pvVertLimit;
		}
	}
	keyboard(code, down){
		if(code == 37 || code == 65){
			this.myKeyboard.k["left"] = down;
		}else if(code == 38 || code == 87){
			this.myKeyboard.k["up"] = down;
		}else if(code == 39 || code == 68){
			this.myKeyboard.k["right"] = down;
		}else if(code == 40 || code == 83){
			this.myKeyboard.k["down"] = down;
		}else if(code == 188 || code == 74){
			this.myKeyboard.k["lt"] = down;
		}else if(code == 190 || code == 76){
			this.myKeyboard.k["gt"] = down;
		}else if(code == 73){
			this.myKeyboard.k["i"] = down;
		}else if(code == 75){
			this.myKeyboard.k["k"] = down;
		}else if(code == 192){
			if(down){
				this.debugmode = !this.debugmode;
				console.log("Debug mode: "+this.debugmode);
				this.redraw = true;
			}
		}
	}
	createProgram(vertex, fragment){
		const gl = this.gl;
		const ver = gl.createShader(gl.VERTEX_SHADER);
		const frag = gl.createShader(gl.FRAGMENT_SHADER);
		gl.shaderSource(ver, vertex);
		gl.shaderSource(frag, fragment);
		gl.compileShader(ver);
		gl.compileShader(frag);
		if(!gl.getShaderParameter(ver, gl.COMPILE_STATUS)){
			E.e("Failed to compile vertex shader: "+gl.getShaderInfoLog(ver));
		}
		if(!gl.getShaderParameter(frag, gl.COMPILE_STATUS)){
			E.e("Failed to compile fragment shader: "+gl.getShaderInfoLog(frag));
		}
		var program = gl.createProgram();
		gl.attachShader(program, ver);
		gl.attachShader(program, frag);
		return program;
	}
	createTextureFromImage(image, canvas){//Modified from khronos group
		const gl = this.gl;
		const texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		if (!isPowerOfTwo(image.width) || !isPowerOfTwo(image.height)) {
			// Scale up the texture to the next highest power of two dimensions.
			canvas.width = nextHighestPowerOfTwo(image.width);
			canvas.height = nextHighestPowerOfTwo(image.height);
			var ctx = canvas.getContext("2d");
			ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
			image = canvas;
		}
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
		gl.generateMipmap(gl.TEXTURE_2D);
		gl.bindTexture(gl.TEXTURE_2D, null);
		return texture;
	}
	addData(){
		const gl = this.gl;
		this.a_position = gl.getAttribLocation(this.program, 'a_position');//position array
		this.a_normal = gl.getAttribLocation(this.program, 'a_normal');//normal array
		this.a_texcoord = gl.getAttribLocation(this.program, 'a_texcoord');//texture coordinates
		gl.enableVertexAttribArray(this.a_position);
		gl.enableVertexAttribArray(this.a_normal);
		gl.enableVertexAttribArray(this.a_texcoord);
		var me = this;
		// Bind normals and texture coordinates
		Object.keys(this.artDef).forEach(k => {
			var d = me.artDef[k];
			d.vbuffer = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, d.vbuffer);
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(d.points.concat(d.normals)), gl.STATIC_DRAW);
			
			d.tbuffer = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, d.tbuffer);
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(d.texCoord), gl.STATIC_DRAW);
		});
	}
}

var loader = new recursiveLoader(GalleryOpts["GalleryDataRoot"]);
var vertShader;
loader.addTarget(GalleryOpts["VertShader"], 'TEXT', function(path, data){vertShader = data;});
var fragShader;
loader.addTarget(GalleryOpts["FragShader"], 'TEXT', function(path, data){fragShader = data;});
var images = {};
var audios = {};
var gallerydata;

/*## CONS (what do we show when you mouse over an artwork?)
 *########
 * NOTHING
 * -examining is disabled, and there is no audio
 * 
 *########
 * LEFT-CLICK ICON
 * -examine is enabled, and autoplay is disabled
 * 
 *########
 * LEFT-CLICK ICON + AUDIO ICON
 * -both examine and autoplay are enabled
 *   OR
 * -examine is disabled, and there is audio
 * 
 *########
 * LEFT-CLICK ICON + AUDIO ICON + PLAY or PAUSE ICON
 * -examine is disabled, and audio exists, and is being played or was played and is now paused (progress through audio is saved, because you haven't gone too far away from the art or played anything else yet)
 * 
 */
for(const icon of ["left-click", "play", "pause", "audio"]){
	loader.addTarget(GalleryOpts["ResourceDir"]+icon+".svg", 'IMG', function(path, data){images["__"+icon] = data});
}

loader.addTarget(gallerydefpath, 'JSON', function(path, data){
	gallerydata = data;
	loader.addTarget(data["texture"], 'IMG', function(path, data){images["__tex"] = data});
	Object.keys(data["art"]).forEach(k => {
		loader.addTarget(data["art"][k]["texture"], 'IMG', function(path, data, remainingload, totalload){
			images[k] = data;
			drawLoading("Loading "+(totalload-remainingload)+"/"+totalload);
		});
	});
	let audioSet = new Set();
	data["artPlacement"].forEach(ap => {
		if("audio" in ap){
			audioSet.add(ap["audio"]);
		}
	});
	for(const aud of audioSet.values()){
		loader.addTarget(aud, 'AUDIO', function(path, data, remainingload, totalload){
			audios[aud] = data;
			drawLoading("Loading "+(totalload-remainingload)+"/"+totalload);
		});
	}
});
var gallery;
loader.onallload = function(){
	E.evt("Everything Loaded");
	ctx.clearRect(0, 0, overlayCanv.width, overlayCanv.height);
	gallery = new Gallery(fsDiv, gallerydata, images, audios, E, QID);
	OGARgallery = gallery;
};
loader.start();

}
if(!isQual){
	ogar_omnibus_func();
}
