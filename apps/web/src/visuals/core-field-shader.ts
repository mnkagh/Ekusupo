/**
 * A raymarched signed-distance field, not a CSS gradient pretending to
 * be 3D. Every pixel walks a ray through an actual 3D scene, so the
 * structure has real perspective and real depth occlusion.
 *
 * The subject is the interoperability core from `docs/vision.md`: three
 * rings on three axes, turning independently, that sources feed into and
 * destinations draw from. It is the product's own diagram, rendered —
 * not an arbitrary blob.
 *
 * Deliberately just the rings — an earlier version wrapped them in a
 * lattice of bars, which pulled attention toward the backdrop.
 *
 * The camera drifts with the pointer where that is enabled; elsewhere
 * `uPointer` stays at zero and the scene simply turns on its own.
 *
 * Written as raw WebGL rather than pulling in three.js: this needs one
 * fullscreen triangle and one fragment shader, and a ~600 KB dependency
 * to draw two triangles would be indefensible in a bundle this size.
 *
 * Cost is controlled deliberately — 48 steps, early exit, and rendered
 * at a fraction of device resolution then scaled up.
 */

export const VERTEX_SHADER = `#version 100
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER = `#version 100
precision mediump float;

uniform vec2  uResolution;
uniform float uTime;
uniform float uIntensity;
uniform vec2  uPointer;
uniform float uVariant;
uniform float uPulse;

const float PI = 3.14159265;

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float sdTorus(vec3 p, vec2 t) {
  vec2 q = vec2(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}

/*
 * Bends space before the ring is measured, so the band buckles out of
 * plane instead of closing as a flat circle. The displacement travels
 * with time, which makes each ring flex as it turns rather than holding
 * a fixed warp.
 *
 * This makes the field a bounded rather than exact distance estimator —
 * the marcher below compensates with a shorter step.
 */
vec3 bend(vec3 p, float amount, float phase) {
  p.y += sin(p.x * 1.7 + phase) * amount;
  p.x += cos(p.z * 1.3 + phase * 0.7) * amount * 0.6;
  return p;
}

float map(vec3 p) {
  vec3 q = p;
  q.xz *= rot(uTime * 0.12);
  q.xy *= rot(uTime * 0.07);

  // Signed in gets slimmer rings — the same form at a different weight,
  // so the views differ without becoming two designs.
  float radius = uVariant < 0.5 ? 1.15 : 1.35;
  float tube = uVariant < 0.5 ? 0.16 : 0.10;

  /*
   * Two bands on different axes. Combined with min() rather than smin():
   * a smooth blend fuses them into one lumpy solid, which is what made
   * an earlier version read as a circle rather than as rings.
   *
   * Two rather than three — a third crossing the same volume left the
   * silhouette busy enough that no single band stayed readable.
   *
   * Each turns at its own rate and is bent by a different amount, out of
   * phase, so they never buckle the same way at the same moment.
   */
  vec3 a = q;
  a.xy *= rot(uTime * 0.21);
  float ringA = sdTorus(bend(a, 0.22, uTime * 0.5), vec2(radius, tube));

  vec3 b = q;
  b.yz *= rot(PI * 0.5 + uTime * 0.16);
  float ringB = sdTorus(bend(b, 0.16, uTime * 0.4 + 2.1), vec2(radius * 0.82, tube));

  return min(ringA, ringB);
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)
  ));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution.xy) / uResolution.y;

  // The camera drifts, the scene does not warp. Warping geometry toward
  // a cursor is the tell of a fake-3D gradient. uPointer is held at zero
  // on views where the effect is switched off, so the same shader serves
  // both without a branch.
  vec3 ro = vec3(uPointer.x * 0.55, uPointer.y * 0.42, -4.2);
  vec3 ta = vec3(0.0, 0.0, 0.0);
  vec3 fw = normalize(ta - ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(uv.x * rt + uv.y * up + 1.55 * fw);

  float t = 0.0;
  bool hit = false;

  for (int i = 0; i < 48; i++) {
    vec3 p = ro + rd * t;
    float d = map(p);
    if (d < 0.0025) { hit = true; break; }
    // Shorter than the usual 0.85: the bend makes map() overestimate how
    // far it is safe to travel, and a full-length step overshoots the
    // surface and punches holes in the rings.
    t += d * 0.55;
    if (t > 12.0) break;
  }

  // The dichroic ramp: teal -> violet -> amber, sampled by surface angle
  // rather than by position, so the colour shifts as the rings turn.
  vec3 tealC   = vec3(0.204, 0.878, 0.816);
  vec3 violetC = vec3(0.545, 0.424, 0.961);
  vec3 amberC  = vec3(1.000, 0.698, 0.420);

  // A click surges the rim and the bloom, then decays — the backdrop
  // answers the interaction instead of only drifting with the cursor.
  float energy = uIntensity * (1.0 + uPulse * 1.6);

  vec3 col = vec3(0.039, 0.031, 0.071);

  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);

    // Rim lighting only. A conventional key light would make this look
    // like a product render; rim alone keeps it graphic and flat-ish,
    // which is what sits quietly behind an interface.
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 2.2);
    float depth = exp(-t * 0.22);

    float f = clamp(rim * 1.35, 0.0, 1.0);
    vec3 iridescent = f < 0.5
      ? mix(tealC, violetC, f * 2.0)
      : mix(violetC, amberC, (f - 0.5) * 2.0);

    col += iridescent * rim * 0.95 * depth * energy;
    col += violetC * 0.05 * depth;
  }

  // No volumetric bloom here. An earlier version added a glow shell at a
  // fixed radius, which rendered as a luminous sphere sitting between the
  // rings — the rings are the subject, and nothing should occupy the
  // space they turn around.

  // Vignette, then grain — the grain breaks up banding in the dark
  // falloff, which is what makes cheap dark gradients look cheap.
  col *= 1.0 - 0.55 * dot(uv, uv);
  float grain = fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453);
  col += (grain - 0.5) * 0.020;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;
