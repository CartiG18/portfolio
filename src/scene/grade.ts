import * as THREE from 'three'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

/**
 * Final display-space pass: a soft vignette, fine film grain and a warm colour grade.
 * Runs after OutputPass so the grain sits on top of the tone-mapped image.
 */
export interface GradeOptions {
  vignette: number
  grain: number
  /** 0 = neutral, 1 = strongly warm. */
  warmth: number
}

export function createGradePass(o: GradeOptions): ShaderPass & { uniforms: Record<string, THREE.IUniform> } {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uVignette: { value: o.vignette },
      uGrain: { value: o.grain },
      uWarmth: { value: o.warmth },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uVignette;
      uniform float uGrain;
      uniform float uWarmth;
      varying vec2 vUv;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }
      void main() {
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        // Warm grade: lift reds in the mids, cool nothing (the accent stays the only cool colour).
        float luma = dot(c, vec3(0.299, 0.587, 0.114));
        vec3 warm = c * vec3(1.0 + 0.06 * uWarmth, 1.0 + 0.01 * uWarmth, 1.0 - 0.06 * uWarmth);
        c = mix(c, warm, smoothstep(0.02, 0.6, luma));
        // Vignette.
        vec2 d = vUv - 0.5;
        c *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
        // Grain, slightly stronger in the shadows.
        float n = hash(vUv * 1024.0 + fract(uTime) * 61.0) - 0.5;
        c += n * uGrain * (1.0 - luma * 0.6);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  }) as ShaderPass & { uniforms: Record<string, THREE.IUniform> }
}
