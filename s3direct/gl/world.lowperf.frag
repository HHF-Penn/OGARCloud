# version 100
precision mediump float;
varying vec3 vNorm;
varying vec3 viewVec;
varying vec2 f_texcoord;//texture coordinates
uniform sampler2D u_texture;//the textures
void main(){
	gl_FragColor = vec4(texture2D(u_texture, f_texcoord).xyz, 1.0);
}
