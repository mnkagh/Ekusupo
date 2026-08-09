import { useEffect, useRef } from "react";

import { FRAGMENT_SHADER, VERTEX_SHADER } from "./core-field-shader.js";
import { prefersReducedMotion } from "./media.js";

/** Below full device resolution — it's a soft background, and this is the single biggest cost lever. */
const RENDER_SCALE = 0.6;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    // Not thrown: a background that fails to compile must not take the
    // app down with it. The CSS fallback underneath is a complete,
    // presentable design on its own.
    console.warn("[CoreField] shader failed to compile", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * The flowing colour field (see `core-field-shader.ts`), mounted as a
 * fixed backdrop.
 *
 * Nothing here reacts to the pointer: a background that tracks the mouse
 * invites the eye to test it, which is the opposite of what a backdrop
 * should do.
 *
 * Degrades in three stages rather than assuming success: no WebGL, or a
 * failed compile, leaves the CSS gradient on `.core-field` visible and
 * nothing else changes; `prefers-reduced-motion` renders one static
 * frame, so the composition survives but the movement does not; and the
 * loop pauses when the tab is hidden, because burning a GPU on an
 * invisible canvas is rude on a laptop battery.
 */
export interface CoreFieldProps {
  /** How dense and quick the field runs — one setting per view, so pages differ in texture. */
  variant?: "calm" | "dense";
  /** Whether the camera follows the pointer. */
  interactive?: boolean;
  /**
   * Whether a click surges the rings' brightness. Reserved for the
   * landing: a backdrop that answers every click is a nice flourish on a
   * page whose job is to be looked at, and a distraction on one where
   * every click is doing real work.
   */
  respondToClick?: boolean;
}

export function CoreField({
  variant = "calm",
  interactive = true,
  respondToClick = false,
}: CoreFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      powerPreference: "low-power",
    });
    if (!gl) return;

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vertex || !fragment) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("[CoreField] program failed to link", gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    // One oversized triangle rather than a quad: fewer vertices, no seam
    // down the diagonal, and it's the standard trick for fullscreen passes.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPosition = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(program, "uResolution");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uIntensity = gl.getUniformLocation(program, "uIntensity");
    const uVariant = gl.getUniformLocation(program, "uVariant");
    const uPointer = gl.getUniformLocation(program, "uPointer");
    const uPulse = gl.getUniformLocation(program, "uPulse");

    const reduceMotion = prefersReducedMotion();

    const pointer = { x: 0, y: 0 };
    const smoothed = { x: 0, y: 0 };

    const handlePointer = (event: PointerEvent) => {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -((event.clientY / window.innerHeight) * 2 - 1);
    };

    // Set to 1 on click and eased back to 0 each frame, so the surge has
    // a fall-off rather than snapping off at a fixed time.
    let pulse = 0;
    const handleDown = () => {
      pulse = 1;
    };

    const resize = () => {
      const width = Math.max(1, Math.floor(window.innerWidth * RENDER_SCALE));
      const height = Math.max(1, Math.floor(window.innerHeight * RENDER_SCALE));
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uResolution, width, height);
    };

    resize();
    window.addEventListener("resize", resize);
    if (interactive && !reduceMotion) {
      window.addEventListener("pointermove", handlePointer, { passive: true });
    }
    if (respondToClick && !reduceMotion) {
      window.addEventListener("pointerdown", handleDown, { passive: true });
    }

    const start = performance.now();
    let frame = 0;

    const render = () => {
      // Easing toward the pointer rather than snapping — instantaneous
      // parallax feels twitchy and cheap.
      smoothed.x += (pointer.x - smoothed.x) * 0.045;
      smoothed.y += (pointer.y - smoothed.y) * 0.045;

      gl.uniform1f(uTime, (performance.now() - start) / 1000);
      gl.uniform2f(uPointer, smoothed.x, smoothed.y);

      pulse *= 0.94;
      gl.uniform1f(uPulse, pulse);
      gl.uniform1f(uIntensity, 1);
      gl.uniform1f(uVariant, variant === "dense" ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      frame = requestAnimationFrame(render);
    };

    if (reduceMotion) {
      gl.uniform1f(uTime, 8.5); // a composed static frame, not t=0
      gl.uniform2f(uPointer, 0, 0);
      gl.uniform1f(uPulse, 0);
      gl.uniform1f(uIntensity, 1);
      gl.uniform1f(uVariant, variant === "dense" ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      frame = requestAnimationFrame(render);
    }

    const handleVisibility = () => {
      if (reduceMotion) return;
      cancelAnimationFrame(frame);
      if (!document.hidden) frame = requestAnimationFrame(render);
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointer);
      window.removeEventListener("pointerdown", handleDown);
      document.removeEventListener("visibilitychange", handleVisibility);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      gl.deleteBuffer(buffer);
    };
  }, [variant, interactive, respondToClick]);

  return (
    <div className="core-field" aria-hidden="true">
      <canvas ref={canvasRef} className="core-field__canvas" />
      <div className="core-field__scrim" />
    </div>
  );
}
