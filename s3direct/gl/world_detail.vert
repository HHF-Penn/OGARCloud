# version 100
//precision mediump float;
precision highp float;
attribute vec3 a_position;
attribute vec3 a_normal;
attribute vec2 a_texcoord;
uniform mat4 u_cam_lens;//This is the gl_perspective matrix equivalent
uniform mat4 u_cam_rot;//Camera look direction (rotation around eye)
uniform mat4 u_cam_trs;//position relative to camera translation
varying mediump vec3 vNorm;
varying mediump vec3 viewVec;
varying mediump vec2 f_texcoord;
varying mediump vec2 f_noisecoord;

void main(){//fixme does everything need to be normalized?
	gl_Position = u_cam_rot * u_cam_trs * vec4(a_position, 1.0);
	viewVec = gl_Position.xyz;
	gl_Position = u_cam_lens * gl_Position;
	vNorm = (u_cam_rot*vec4(a_normal, 0)).xyz;
	f_texcoord = a_texcoord;
	vec3 rotnorm = vec3(a_normal.y, -a_normal.z, a_normal.x);
	f_noisecoord.x = dot(a_position, rotnorm);
	f_noisecoord.y = dot(a_position, cross(rotnorm, a_normal));
}
