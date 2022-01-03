# version 100
precision mediump float;
attribute vec3 a_position;
attribute vec3 a_normal;
attribute vec2 a_texcoord;
uniform mat4 u_cam_lens;//This is the gl_perspective matrix equivalent
uniform mat4 u_cam_rot;//Camera look direction (rotation around eye)
uniform mat4 u_cam_trs;//position relative to camera translation
varying vec3 vNorm;
varying vec3 viewVec;
varying vec2 f_texcoord;

void main(){//fixme does everything need to be normalized?
	gl_Position = u_cam_lens * u_cam_rot * u_cam_trs * vec4(a_position, 1.0);
	f_texcoord = a_texcoord;
}
