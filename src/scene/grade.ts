import * as THREE from 'three'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

/**
 * Final display-space pass: a soft vignette, fine film grain and a warm colour grade.
 * Runs after OutputPass so the grain sits on top of the tone-mapped image.
 */
export interface GradeOptions {
  vignette: number
  grain: number
  /** 0 = neutral, 1 = warm, 2 = deep amber (golden hour). */
  warmth: number
  /** Strength of the screen-space sunbeams (0 = off). */
  rays?: number
}

export function createGradePass(o: GradeOptions): ShaderPass & { uniforms: Record<string, THREE.IUniform> } {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uVignette: { value: o.vignette },
      uGrain: { value: o.grain },
      uWarmth: { value: o.warmth },
      uRays: { value: o.rays ?? 0 },
      // Direction light travels across the screen (uv space) and where it enters from.
      uRayDir: { value: new THREE.Vector2(-0.62, -0.78).normalize() },
      uAspect: { value: 1.6 },
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
      uniform float uRays;
      uniform vec2 uRayDir;
      uniform float uAspect;
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
        // Deep amber for golden hour (warmth beyond 1): pull blues down, lift reds in the shadows too.
        float amber = clamp(uWarmth - 1.0, 0.0, 1.0);
        c = mix(c, c * vec3(1.12, 0.98, 0.78) + vec3(0.025, 0.012, 0.0), amber);
        // Screen-space sunbeams: soft parallel bands entering from off-screen top-right.
        if (uRays > 0.001) {
          vec2 p = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);
          vec2 dir = normalize(vec2(uRayDir.x * uAspect, uRayDir.y));
          vec2 perp = vec2(-dir.y, dir.x);
          float across = dot(p, perp);
          float along = dot(p, -dir); // larger toward the light source
          // A few bands of varied width, slowly drifting; smooth on every side.
          float bands = 0.0;
          bands += smoothstep(0.55, 1.0, 0.5 + 0.5 * sin(across * 9.0 + uTime * 0.05));
          bands += 0.7 * smoothstep(0.6, 1.0, 0.5 + 0.5 * sin(across * 15.0 + 1.7 - uTime * 0.04));
          bands += 0.5 * smoothstep(0.7, 1.0, 0.5 + 0.5 * sin(across * 23.0 + 4.1 + uTime * 0.03));
          // Strongest near the entry edge, fading out well before the far edge (no ends in frame).
          float fall = smoothstep(-0.9, 0.7, along) * (1.0 - smoothstep(0.55, 1.1, along));
          c += vec3(1.0, 0.86, 0.62) * bands * fall * uRays * (1.0 - luma * 0.5);
        }
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
