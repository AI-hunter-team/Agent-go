import { Group } from "three";
import type { DetailPlacement } from "../../shared/world";
import type { GeneratedPalette } from "./generatedSurfaces";
import { SurfaceBuilder } from "./surfaceGeometry";

export function createGeneratedProp(d: Pick<DetailPlacement, "family" | "variant">, p: GeneratedPalette): Group {
  const b = new SurfaceBuilder(), variant = d.variant === 1;
  if (d.family === "platform") {
    // Slatted metal seat, back, legs and armrests; no solid block under passengers.
    for (const x of [-1.05, 1.05]) {
      b.bar(p.steel, [x, .04, -.24], [x, .57, -.18], .05); b.bar(p.steel, [x, .04, .24], [x, .57, .18], .05);
      b.box(p.steel, [.45, .04, .68], [x, .02, 0]);
    }
    for (let i = 0; i < 5; i++) b.box(p.sage, [3, .065, .11], [0, .58, -.28 + i * .14]);
    for (let i = 0; i < 4; i++) b.box(p.sage, [3, .1, .065], [0, .79 + i * .13, .34]);
    for (const x of variant ? [-1.42, -.48, .48, 1.42] : [-1.42, 1.42]) {
      b.bar(p.steel, [x, .6, .22], [x, .84, .22]); b.bar(p.steel, [x, .84, .22], [x, .84, -.22]);
    }
  } else if (d.family === "commercial") {
    // A framed cabinet with a real glazed aperture; products sit inside, not on the glass.
    for (const x of [-.615,.415]) b.box(p.paint,[.05,2.2,.94],[x,1.1,0]);
    b.box(p.paint,[1.08,2.2,.05],[-.1,1.1,-.445]);
    for (const y of [.03,2.17]) b.box(p.paint,[1.08,.06,.94],[-.1,y,0]);
    b.box(p.paint,[1.02,.55,.04],[-.1,.305,.47]); b.box(p.paint,[.2,1.4,.04],[.315,1.3,.47]); b.box(p.jade, [1.02, .2, .035], [-.1, 2.04, .49]);
    b.box(p.rubber, [.7, 1.28, .035], [-.2, 1.23, .12]); b.box(p.glass, [.68, 1.22, .025], [-.2, 1.25, .495]);
    for (let row = 0; row < 3; row++) {
      b.box(p.steel, [.7, .035, .28], [-.2, .77 + row * .37, .32]);
      for (let col = 0; col < 3; col++) {
        const x = -.4 + col * .2, y = .9 + row * .37;
        b.bar(variant ? p.jade : p.paint, [x, y - .1, .35], [x, y + .1, .35], .05);
        b.box(p.red, [.105, .07, .015], [x, y, .405]); b.box(p.steel, [.045, .025, .045], [x, y + .11, .35]);
      }
    }
    b.box(p.screen, [.19, .3, .035], [.29, 1.58, .51]); b.box(p.rubber, [.14, .025, .03], [.29, 1.2, .52]);
    b.box(p.rubber, [.8, .18, .035], [-.12, .28, .49]); b.box(p.steel, [.82, .025, .12], [-.12, .18, .54]);
    b.box(p.dark, [.25, 1.25, .4], [.67, .625, 0]); b.box(p.screen, [.22, .24, .02], [.67, 1.05, .22]);
    for (const y of [.5, .6, .7]) b.box(p.steel, [.21, .025, .025], [.67, y, .22]);
  } else if (d.family === "security") {
    b.box(p.steel, [2, .08, .8], [0, .75, 0]);
    for (const x of [-.83, .83]) for (const z of [-.3, .3]) b.bar(p.steel, [x, .04, z], [x, .72, z], .025);
    b.box(p.dark, [1.75, .05, .58], [0, .35, 0]);
    for (let i = 0; i < (variant ? 6 : 4); i++) {
      const y = .82 + i * .055; b.box(p.sage, [.57, .022, .42], [.2, y, 0]);
      for (const x of [-.28, .28]) b.box(p.sage, [.025, .045, .42], [.2 + x, y + .025, 0]);
      for (const z of [-.2, .2]) b.box(p.sage, [.57, .045, .025], [.2, y + .025, z]);
    }
  } else if (d.family === "entrance") {
    b.box(p.steel, [2.6, 2.6, .12], [0, 1.6, 0]); b.box(p.paint, [2.42, 2.42, .025], [0, 1.6, .075]);
    b.box(variant ? p.jade : p.dark, [2.3, .26, .025], [0, 2.57, .09]);
    for (const x of [-.7, .65]) {
      b.box(p.wall, [.95, 1.45, .02], [x, 1.45, .095]);
      for (let i = 0; i < 7; i++) b.box(i === 1 ? p.jade : p.steel, [.77 - (i % 3) * .1, .025, .012], [x, 2.02 - i * .16, .11]);
    }
    // Schematic route rather than an unrelated poster/photo.
    b.box(p.jade, [1.9, .035, .012], [0, .55, .11]);
    for (let x = -.8; x <= .8; x += .4) b.box(p.paint, [.065, .1, .02], [x, .55, .12]);
  } else if (d.family === "tickets") {
    b.box(p.wall, [3, 2.9, .25], [0, 1.45, -.1]); b.box(p.steel, [2.2, 1.22, .035], [0, 1.83, .055]);
    b.box(p.glass, [2.04, 1.06, .035], [0, 1.83, .08]); b.box(p.dark, [.06, 1.12, .045], [0, 1.83, .105]);
    b.box(p.stone, [2.8, .1, .4], [0, variant ? .82 : .96, .1]);
    b.box(p.screen, [.38, .25, .07], [-.6, 1.22, .18]); b.box(p.steel, [.48, .04, .22], [-.6, 1.03, .23]);
    b.box(p.rubber, [.4, .1, .04], [.35, 1.18, .11]); b.box(p.jade, [2.8, .18, .035], [0, 2.72, .08]);
  } else if (d.family === "gates" || d.family === "connections") {
    b.bar(p.steel, [0, .02, 0], [0, d.family === "gates" ? 2.5 : variant ? 1.05 : .95, 0], .035);
    b.box(variant ? p.jade : p.steel, [.14, .035, .14], [0, .018, 0]);
    if (d.family === "connections") { b.box(p.dark, [.7, .48, .1], [0, .77, 0]); b.box(p.jade, [.5, .1, .015], [0, .85, .06]); }
  } else if (d.family === "maintenance") {
    b.box(p.steel, [2.16, 2.87, .14], [0, 1.435, 0]); b.box(p.paint, [1.96, 2.72, .035], [0, 1.38, .09]);
    b.box(p.rubber, [.025, 2.72, .012], [0, 1.38, .115]); b.bar(p.steel, [.6, 1.08, .16], [.6, 1.32, .16], .018);
    for (const x of [-.8, .8]) for (const y of [.35, 2.4]) b.box(p.steel, [.045, .13, .03], [x, y, .12]);
    for (let i = 0; i < (variant ? 6 : 4); i++) b.box(p.dark, [1.65, .025, .03], [0, .28 + i * .08, .12]);
    for(const x of [-1.98,-1.32]) b.box(p.red,[.04,1.42,.22],[x,1.1,0]);
    for(const y of [.41,1.79]) b.box(p.red,[.7,.04,.22],[-1.65,y,0]);
    b.box(p.red,[.7,1.42,.025],[-1.65,1.1,-.1]); b.box(p.glass, [.57, 1.25, .035], [-1.65, 1.1, .13]);
    b.bar(p.red, [-1.8, .66, .01], [-1.8, 1.17, .01], .07); b.bar(p.steel, [-1.8, 1.17, .01], [-1.8, 1.28, .01], .018);
    for (let i = 0; i < 8; i++) b.box(p.steel, [2.2, .045, .16], [0, 3.05 + i * .075, 0]);
  }
  const root = b.finish(`prop-${d.family}-${d.variant}`); root.userData = { family: d.family, variant: d.variant, surfaces: true }; return root;
}
