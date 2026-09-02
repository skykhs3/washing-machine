import { CONFIG } from './config.js';
import { Viewport } from './render/viewport.js';
import { Renderer } from './render/renderer.js';

const canvas = document.getElementById('scene');

const vp = new Viewport(canvas);
const renderer = new Renderer(vp, CONFIG);

function frame() {
  requestAnimationFrame(frame);
  renderer.draw();
}

requestAnimationFrame(frame);
