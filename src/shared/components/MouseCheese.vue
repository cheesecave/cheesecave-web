<script setup>
import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
const props = defineProps({ animated: { type: Boolean, default: true } });
const svgSource =
  '<svg xmlns="http://www.w3.org/2000/svg" width="534" height="534" viewBox="0 0 534 534" fill="none" class="mouse-cheese-combined-svg" role="img" aria-labelledby="art-title art-desc">\n  <title id="art-title">奶酪里探出头的小老鼠</title>\n  <desc id="art-desc">透明背景，灰色小老鼠带着粉红耳朵和尾巴，从一块金黄色、带咬痕的奶酪中探出头。</desc>\n  <defs>\n    <!-- The root emerges behind the front lip; the free end can drape to its right. -->\n    <clipPath id="tail-occlusion"><path d="M0 0 H534 V534 H426 V221 C420 225 412 228 403 230 C380 236 360 236 340 235 H0 Z"/></clipPath>\n\n    <path id="cheese-outline" d="M35 332 L51 318 C57 326 71 327 78 318 C90 323 99 311 96 301 C111 306 122 291 118 282 L111 270 L174 224 C186 230 199 241 203 228 C207 220 201 208 203 199 L276 155 C312 139 362 140 400 158 C435 172 473 195 487 217 C491 223 492 230 492 240 L492 264 C486 269 484 277 488 284 C478 289 477 308 486 316 C480 324 483 337 492 343 L495 409 C496 428 490 438 474 444 L79 520 C61 523 49 521 43 512 C39 507 38 497 38 487 C48 482 48 471 45 465 C58 459 57 444 47 436 C55 425 49 413 37 411 Z"/>\n    <clipPath id="cheese-clip"><use href="#cheese-outline"/></clipPath>\n    <path id="hole-shape" d="M250 192 C260 177 291 171 324 169 C363 165 401 172 422 183 C438 192 444 207 429 219 C413 231 377 236 340 235 C302 234 270 230 257 220 C249 214 246 203 250 192 Z"/>\n    <clipPath id="hole-clip"><use href="#hole-shape"/></clipPath>\n    <clipPath id="mouse-occlusion">\n      <!-- The mouse passes behind only the continuous FRONT lip. The rear and\n           side rim stay behind the ears: joining them into this clip creates\n           triangular cheese intrusions through the rising pink inner ears. -->\n      <path d="M0 0 H534 V202 H442 C438 202 438 212 429 219 C413 231 377 236 340 235 C302 234 270 230 257 220 C250 215 248 202 244 202 H0 Z"/>\n    </clipPath>\n    <clipPath id="large-pore"><path d="M224 364 C231 336 254 319 280 321 C306 322 326 342 327 367 C329 392 312 413 288 421 C265 428 242 416 229 396 C222 386 219 377 224 364 Z"/></clipPath>\n    <clipPath id="upper-pore"><ellipse cx="359.5" cy="273" rx="44.7" ry="31.7" transform="rotate(-17 359.5 273)"/></clipPath>\n    <clipPath id="right-pore"><ellipse cx="433.8" cy="380.5" rx="35.8" ry="33.3" transform="rotate(-24 433.8 380.5)"/></clipPath>\n    <clipPath id="left-pore"><ellipse cx="164.2" cy="303.4" rx="27.4" ry="20.2" transform="rotate(-17 164.2 303.4)"/></clipPath>\n    <clipPath id="lower-pore"><ellipse cx="171.8" cy="433.5" rx="26.6" ry="27" transform="rotate(-14 171.8 433.5)"/></clipPath>\n    <radialGradient id="cheek-pink"><stop stop-color="#efa7a5" stop-opacity=".48"/><stop offset="1" stop-color="#efa7a5" stop-opacity="0"/></radialGradient>\n  </defs>\n  <g id="cheese" class="cheese">\n    <use href="#cheese-outline" fill="#f4b541"/>\n    <g clip-path="url(#cheese-clip)">\n      <path fill="#f9e079" d="M24 329 L193 197 L305 134 L383 140 C430 159 478 191 493 221 L493 233 L41 345 Z"/>\n      <g fill="#ef8f3b">\n        <path d="M36 308 C49 308 55 314 59 317 C67 310 76 309 81 312 C84 304 88 300 97 298 C100 286 107 279 116 277 L119 286 C121 297 111 305 102 303 C101 316 91 325 80 319 C68 330 52 324 48 318 Z"/>\n        <path d="M33 410 C56 408 66 416 68 429 C67 437 62 440 62 443 C71 452 66 465 56 469 C58 480 49 488 38 490 L24 475 Z"/>\n        <path d="M491 264 C474 268 468 281 473 289 C460 297 461 314 473 322 C467 333 474 345 494 348 L506 288 Z"/>\n      </g>\n      <g id="cheese-pores">\n        <g clip-path="url(#large-pore)"><path fill="#e07143" d="M216 314H335V430H216Z"/><path fill="#ef8f3b" d="M244 379 C254 354 284 335 308 342 C333 349 342 378 326 403 C311 430 277 435 253 420 C241 411 237 395 244 379 Z"/></g>\n        <g clip-path="url(#upper-pore)"><path fill="#e07143" d="M309 230H411V311H309Z"/><ellipse fill="#ef8f3b" cx="366" cy="282" rx="46" ry="28" transform="rotate(-15 366 282)"/></g>\n        <g clip-path="url(#right-pore)"><path fill="#e07143" d="M392 342H476V418H392Z"/><ellipse fill="#ef8f3b" cx="443" cy="389" rx="37" ry="31" transform="rotate(-30 443 389)"/></g>\n        <g clip-path="url(#left-pore)"><path fill="#e07143" d="M134 278H196V329H134Z"/><ellipse fill="#ef8f3b" cx="168" cy="312" rx="27.7" ry="17.2" transform="rotate(-15 168 312)"/></g>\n        <g clip-path="url(#lower-pore)"><path fill="#e07143" d="M141 403H203V465H141Z"/><ellipse fill="#ef8f3b" cx="179" cy="442" rx="27" ry="24" transform="rotate(-25 179 442)"/></g>\n        <path fill="#e07143" d="M70 382 C71 372 79 365 88 365 C98 366 105 373 105 383 C105 393 97 400 87 400 C77 400 69 392 70 382 Z"/>\n        <path fill="#ef8f3b" d="M80 384 C80 376 89 370 97 373 C104 376 107 385 103 392 C98 399 89 402 83 397 C80 394 79 389 80 384 Z"/>\n      </g>\n    </g>\n    <g id="hole" clip-path="url(#hole-clip)">\n      <use href="#hole-shape" fill="#ef8f3b"/>\n      <path fill="#e07143" d="M243 215 C283 193 338 191 386 200 C411 204 430 212 445 224 L445 247 H242 Z"/>\n    </g>\n  </g>\n  <g clip-path="url(#mouse-occlusion)">\n    <g id="mouse" class="mouse-rise">\n      <g id="ear-left" class="ear-left">\n        <path fill="#aeaeae" d="M277 12 C251 12 232 31 230 57 C228 82 244 101 269 106 C294 111 319 91 323 67 C327 41 305 11 277 12 Z"/>\n        <path fill="#f4aaa9" d="M277 33 C261 33 250 47 250 61 C250 77 262 88 277 89 C289 90 294 80 303 72 C310 65 310 56 305 47 C300 38 289 32 277 33 Z"/>\n      </g>\n      <g id="ear-right" class="ear-right">\n        <path fill="#aeaeae" d="M419 19 C394 17 377 34 374 58 C371 81 387 107 410 111 C436 117 460 98 464 73 C470 46 448 19 419 19 Z"/>\n        <path fill="#f4aaa9" d="M418 39 C403 39 392 51 389 65 C386 73 394 79 397 87 C403 98 420 98 432 92 C445 86 449 71 444 58 C439 44 430 39 418 39 Z"/>\n      </g>\n      <path id="mouse-body" fill="#aeaeae" d="M339 53 C365 51 392 64 406 87 C419 108 423 132 411 154 C407 163 400 170 393 176 C399 190 403 211 405 233 C370 243 313 242 278 230 C283 210 286 191 294 175 C279 166 270 148 271 132 C269 106 281 83 301 68 C312 59 325 54 339 53 Z"/>\n      <g id="face">\n        <ellipse fill="url(#cheek-pink)" cx="295" cy="134" rx="25" ry="22"/>\n        <ellipse fill="url(#cheek-pink)" cx="396" cy="138" rx="24" ry="21"/>\n        <!-- The curious face is visible only while peeking. Base attributes\n             intentionally preserve the original static and finished artwork. -->\n        <g class="curious-expression" opacity="0">\n          <g class="curious-gaze">\n            <g class="curious-eyes" fill="#323232">\n              <path d="M301 109 C309 105 321 105 328 109 C332 111 333 115 330 118 C328 120 325 119 322 117 C316 114 310 115 305 118 C302 120 298 118 298 115 C298 112 299 110 301 109 Z"/>\n              <path d="M361 111 C369 107 381 107 388 111 C392 113 393 117 390 120 C388 122 385 121 382 119 C376 116 370 117 365 120 C362 122 358 120 358 117 C358 114 359 112 361 111 Z"/>\n            </g>\n          </g>\n          <ellipse fill="#323232" cx="344" cy="159" rx="4.5" ry="5.5"/>\n        </g>\n        <path fill="#323232" d="M335 130 C335 123 340 119 345 120 C352 120 357 126 355 132 C354 137 350 141 348 144 L348 150 L340 151 L340 144 C336 139 334 136 335 130 Z"/>\n        <g class="happy-expression" opacity="1">\n          <g class="happy-eyes" fill="#323232">\n            <path d="M300 107 C304 97 315 94 323 101 C328 105 331 109 332 113 C334 120 327 122 322 116 L315 110 C311 112 309 116 305 117 C299 118 297 113 300 107 Z"/>\n            <path d="M360 109 C366 100 375 98 382 103 C387 106 390 111 391 115 C393 121 387 124 382 120 L375 114 C371 114 368 120 363 120 C357 120 356 115 360 109 Z"/>\n          </g>\n          <g class="happy-mouth">\n            <path fill="#fff" d="M332 154 L356 154 C355 162 353 172 348 173 C345 174 343 171 342 171 C339 174 335 172 334 169 C332 165 332 159 332 154 Z"/>\n            <path fill="#323232" d="M303 135 C306 132 313 140 321 143 C340 151 363 147 378 139 C385 135 385 141 381 145 C368 158 347 161 332 156 C319 153 308 147 304 142 C302 139 301 137 303 135 Z"/>\n          </g>\n        </g>\n        <g stroke="#626460" stroke-width="5.7" stroke-linecap="round">\n          <path d="M260 126 L293 132 M257 141 L293 142 M265 156 L293 151"/>\n          <path d="M398 137 L429 133 M398 146 L430 151 M396 153 L422 165"/>\n        </g>\n      </g>\n    </g>\n  </g>\n  <g id="tail" class="tail-rise" clip-path="url(#tail-occlusion)">\n    <path class="tail-shape" fill="#f4aaa9" d="M407 224 C401 216 402 204 408 197 C414 190 424 190 431 196 C444 206 447 220 444 235 C442 250 437 262 435 275 C433 284 437 290 444 295 C432 293 426 284 429 272 L435 236 C438 225 436 216 430 209 C426 204 420 204 417 209 C415 213 418 219 422 222 Z"/>\n  </g>\n</svg>\n';
const motionCss =
  "/* One continuous 4000ms gesture: rustle 0–1600ms, peek 1600–4000ms. */\n.mouse-cheese-combined-svg {\n  --p2m-duration: 4000ms;\n  --p2m-ease-enter: cubic-bezier(.4, 0, .2, 1);\n  --p2m-ease-settle: cubic-bezier(.22, 1, .36, 1);\n}\n.mouse-cheese-combined-svg .mouse-rise { animation: mouse-cheese-combined-peek var(--p2m-duration) linear backwards; transform-origin: 342px 234px; }\n.mouse-cheese-combined-svg .ear-left { animation: mouse-cheese-combined-ear-left var(--p2m-duration) linear backwards; transform-origin: 300px 96px; }\n.mouse-cheese-combined-svg .ear-right { animation: mouse-cheese-combined-ear-right var(--p2m-duration) linear backwards; transform-origin: 391px 100px; }\n@keyframes mouse-cheese-combined-peek {\n  0%, 40%, 48.4% { transform: translateY(240px) scaleX(.86); animation-timing-function: cubic-bezier(.4,0,.2,1); }\n  52% { transform: translateY(192px) scaleX(.86); animation-timing-function: cubic-bezier(.4,0,.2,1); }\n  62.2% { transform: translateY(110px) scaleX(.86); animation-timing-function: cubic-bezier(.4,0,.2,1); }\n  67.6% { transform: translateY(116px) scaleX(.88); animation-timing-function: cubic-bezier(.34,0,.14,1); }\n  82% { transform: translateY(-3px); animation-timing-function: cubic-bezier(.4,0,.6,1); }\n  88% { transform: translateY(2px); animation-timing-function: cubic-bezier(.22,1,.36,1); }\n  94%, 100% { transform: none; }\n}\n@keyframes mouse-cheese-combined-ear-left {\n  0%, 40%, 68.8% { transform: translate(6px,-8px) rotate(-8deg) scale(.76,.82); animation-timing-function: cubic-bezier(.4,0,.2,1); }\n  72.4% { transform: translate(6px,-8px) rotate(-8deg) scale(.76,.82); animation-timing-function: cubic-bezier(.22,1,.36,1); }\n  83.2% { transform: rotate(2deg); animation-timing-function: cubic-bezier(.4,0,.2,1); }\n  90.4% { transform: rotate(-1deg); animation-timing-function: cubic-bezier(.22,1,.36,1); }\n  95.8%, 100% { transform: none; }\n}\n@keyframes mouse-cheese-combined-ear-right {\n  0%, 40%, 71.2% { transform: translate(-6px,-10px) rotate(8deg) scale(.76,.82); animation-timing-function: cubic-bezier(.4,0,.2,1); }\n  73.6% { transform: translate(-6px,-10px) rotate(8deg) scale(.76,.82); animation-timing-function: cubic-bezier(.22,1,.36,1); }\n  85% { transform: rotate(-2deg); animation-timing-function: cubic-bezier(.4,0,.2,1); }\n  92.2% { transform: rotate(1deg); animation-timing-function: cubic-bezier(.22,1,.36,1); }\n  97.6%, 100% { transform: none; }\n}\n/* One blink changes a curious peek into the original contented smile.\n   Visibility switches at 73.6% (2944ms); it never crossfades two eye sets. */\n.mouse-cheese-combined-svg .curious-expression { opacity: 0; animation: mouse-cheese-combined-curious-visible var(--p2m-duration) step-end backwards; }\n.mouse-cheese-combined-svg .happy-expression { opacity: 1; animation: mouse-cheese-combined-happy-visible var(--p2m-duration) step-end backwards; }\n.mouse-cheese-combined-svg .curious-gaze { animation: mouse-cheese-combined-curious-gaze var(--p2m-duration) linear backwards; }\n.mouse-cheese-combined-svg .curious-eyes { animation: mouse-cheese-combined-curious-blink var(--p2m-duration) linear backwards; transform-origin: 345px 109.5px; }\n.mouse-cheese-combined-svg .happy-eyes { animation: mouse-cheese-combined-happy-blink var(--p2m-duration) linear backwards; transform-origin: 345px 109.5px; }\n.mouse-cheese-combined-svg .happy-mouth { animation: mouse-cheese-combined-smile var(--p2m-duration) linear backwards; transform-origin: 344px 151px; }\n@keyframes mouse-cheese-combined-curious-visible {\n  0%, 40% { opacity: 1; }\n  73.6%, 100% { opacity: 0; }\n}\n@keyframes mouse-cheese-combined-happy-visible {\n  0%, 40% { opacity: 0; }\n  73.6%, 100% { opacity: 1; }\n}\n@keyframes mouse-cheese-combined-curious-gaze {\n  0%, 40%, 58.6% { transform: translateX(-.8px); animation-timing-function: ease-in-out; }\n  64%, 67.6% { transform: translateX(.8px); animation-timing-function: ease-in-out; }\n  70.6%, 100% { transform: none; }\n}\n@keyframes mouse-cheese-combined-curious-blink {\n  0%, 40%, 70.6% { transform: none; animation-timing-function: ease-in; }\n  73.3%, 100% { transform: scaleY(.08); }\n}\n@keyframes mouse-cheese-combined-happy-blink {\n  0%, 40%, 73.6% { transform: scaleY(.08); animation-timing-function: ease-out; }\n  76.6%, 100% { transform: none; }\n}\n@keyframes mouse-cheese-combined-smile {\n  0%, 40%, 73.6% { transform: scale(.62,.6); animation-timing-function: cubic-bezier(.22,1,.36,1); }\n  80.8%, 100% { transform: none; }\n}\n/* .finished is used by both the Vue player and deterministic export tooling. */\n.mouse-cheese-combined-svg.finished .curious-expression,\n.mouse-cheese-combined-svg.finished .happy-expression,\n.mouse-cheese-combined-svg.finished .curious-gaze,\n.mouse-cheese-combined-svg.finished .curious-eyes,\n.mouse-cheese-combined-svg.finished .happy-eyes,\n.mouse-cheese-combined-svg.finished .happy-mouth { animation: none !important; transform: none !important; }\n.mouse-cheese-combined-svg.finished .curious-expression { opacity: 0 !important; }\n.mouse-cheese-combined-svg.finished .happy-expression { opacity: 1 !important; }\n\n/* Feed the tip up from behind the front lip, then fold over the rim.\n   The same opaque ribbon stays attached; no fading, drawing mask or scaling. */\n.mouse-cheese-combined-svg .tail-rise { opacity:1; transform:none; }\n.mouse-cheese-combined-svg .tail-shape { animation:mouse-cheese-combined-tail-from-hole var(--p2m-duration) linear backwards; }\n@keyframes mouse-cheese-combined-tail-from-hole {\n 0%, 40%, 74.8% { d:path('M 409 273 C 409 270 409 267 410 265 C 410 263 411 261 412 259 C 413 257 414 255 415 253 C 416 251 416 249 417 247 C 417 246 418 245 419 246 C 422 251 420 256 418 260 L 417 264 C 416 267 416 270 417 272 C 418 274 420 275 422 274 C 420 277 414 277 410 275 Z'); animation-timing-function:cubic-bezier(.4,0,.2,1); }\n 78.4% { d:path('M409 238 C409 235 409 232 410 230 C410 228 411 226 412 224 C413 222 414 220 415 218 C416 216 416 214 417 212 C417 211 418 210 419 211 C422 216 420 221 418 225 L417 229 C416 232 416 235 417 237 C418 239 420 240 422 239 C420 242 414 242 410 240 Z'); animation-timing-function:cubic-bezier(.4,0,.2,1); }\n 82% { d:path('M407 235 C405 228 406 220 409 214 C411 208 413 202 416 197 C418 193 419 189 420 186 C420 184 421 182 422 182 C424 182 425 184 425 186 C424 190 424 193 424 197 L423 207 C422 215 419 220 417 224 C415 228 416 231 419 233 C420 235 421 235 422 235 Z'); animation-timing-function:cubic-bezier(.4,0,.2,1); }\n 86.2% { d:path('M407 224 C401 216 402 204 408 197 C414 190 424 190 431 196 C437 200 440 203 442 206 C446 211 449 216 450 219 C451 222 451 225 449 226 C442 223 436 217 432 213 L430 211 C427 207 425 205 422 206 C416 207 414 213 418 218 C419 220 420 221 422 222 Z'); animation-timing-function:cubic-bezier(.45,0,.7,1); }\n 91.6% { d:path('M407 224 C401 216 402 204 408 197 C414 190 424 190 431 196 C444 206 447 220 444 235 C442 250 439 257 438 269 C437 277 441 282 447 286 C435 285 431 276 432 266 L435 236 C438 225 436 216 430 209 C426 204 420 204 417 209 C415 213 418 219 422 222 Z'); animation-timing-function:cubic-bezier(.22,1,.36,1); }\n 97%, 100% { d:path('M407 224 C401 216 402 204 408 197 C414 190 424 190 431 196 C444 206 447 220 444 235 C442 250 437 262 435 275 C433 284 437 290 444 295 C432 293 426 284 429 272 L435 236 C438 225 436 216 430 209 C426 204 420 204 417 209 C415 213 418 219 422 222 Z'); }\n}\n.mouse-cheese-combined-svg.finished .tail-rise,\n.mouse-cheese-combined-svg.finished .tail-shape { animation:none!important; transform:none!important; opacity:1!important; }\n\n\n\n.mouse-cheese-combined-svg .cheese {\n  transform-origin: 266px 483px;\n  transform-box: view-box;\n  animation: mouse-cheese-combined-rustle var(--p2m-duration) linear backwards;\n}\n@keyframes mouse-cheese-combined-rustle {\n  0% { transform: none; animation-timing-function: cubic-bezier(.4,0,.2,1); }\n  5.6% { transform: none; animation-timing-function: cubic-bezier(.4,0,.2,1); }\n  10.4% { transform: translateX(-0.45px) rotate(-0.72deg); animation-timing-function: cubic-bezier(.4,0,.2,1); }\n  15.6% { transform: translateX(-0.15px) rotate(-0.16deg); animation-timing-function: cubic-bezier(.4,0,.2,1); }\n  18.4% { transform: translateX(-0.15px) rotate(-0.16deg); animation-timing-function: cubic-bezier(.4,0,.2,1); }\n  23.6% { transform: translateX(0.8px) rotate(1.18deg); animation-timing-function: cubic-bezier(.4,0,.2,1); }\n  29.2% { transform: translateX(-0.22px) rotate(-0.34deg); animation-timing-function: cubic-bezier(.4,0,.2,1); }\n  34% { transform: translateX(0.08px) rotate(0.10deg); animation-timing-function: cubic-bezier(.4,0,.2,1); }\n  40%, 100% { transform: none; animation-timing-function: cubic-bezier(.4,0,.2,1); }\n}\n\n.mouse-cheese-combined-svg.finished * { animation: none !important; }\n";
const instancePrefix = `mouse-cheese-${getCurrentInstance()?.uid ?? 0}`;
function isolateSvgIds(markup) {
  const ids = [
    ...new Set(
      [...markup.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]),
    ),
  ];
  const replacements = new Map(
    ids.map((id) => [id, `${instancePrefix}-${id}`]),
  );
  for (const id of ids) {
    const replacement = replacements.get(id);
    markup = markup
      .replaceAll(`id="${id}"`, `id="${replacement}"`)
      .replaceAll(`id='${id}'`, `id='${replacement}'`)
      .replaceAll(`url(#${id})`, `url(#${replacement})`)
      .replaceAll(`href="#${id}"`, `href="#${replacement}"`)
      .replaceAll(`href='#${id}'`, `href='#${replacement}'`);
  }
  markup = markup.replace(
    /(\baria-(?:labelledby|describedby)=["'])([^"']*)(["'])/g,
    (_match, opening, references, closing) => {
      const uniqueReferences = references
        .split(/\s+/)
        .map((id) => replacements.get(id) ?? id)
        .join(" ");
      return `${opening}${uniqueReferences}${closing}`;
    },
  );
  return markup;
}

const svgMarkup = isolateSvgIds(
  svgSource
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/, "")
    .replace(
      'aria-labelledby="art-title art-desc"',
      'aria-label="奶酪里探出头的小老鼠" aria-describedby="art-desc"',
    )
    .replace(
      /<svg\b[^>]*>/,
      (opening) => `${opening}<style>${motionCss}</style>`,
    ),
);
const reducedMotion = ref(true);
const finished = ref(true);
const playKey = ref(0);
let motionQuery;
let timer;
const staticFrame = computed(
  () => !props.animated || reducedMotion.value || finished.value,
);
function restart() {
  clearTimeout(timer);
  finished.value = !props.animated || reducedMotion.value;
  playKey.value += 1;
  if (!finished.value)
    timer = setTimeout(() => {
      finished.value = true;
    }, 4000);
}
function onMotionChange(event) {
  reducedMotion.value = event.matches;
  restart();
}
watch(() => props.animated, restart);
onMounted(() => {
  motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  reducedMotion.value = motionQuery?.matches ?? true;
  motionQuery?.addEventListener("change", onMotionChange);
  restart();
});
onBeforeUnmount(() => {
  clearTimeout(timer);
  motionQuery?.removeEventListener("change", onMotionChange);
});
</script>
<template>
  <div
    :key="playKey"
    class="mouse-cheese"
    :class="{ 'static-frame': staticFrame }"
    v-html="svgMarkup"
  ></div>
</template>
<style scoped>
.mouse-cheese {
  aspect-ratio: 1;
}
.mouse-cheese :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}
.static-frame :deep(svg *) {
  animation: none !important;
}
.static-frame :deep(.curious-expression) {
  opacity: 0 !important;
}
.static-frame :deep(.happy-expression) {
  opacity: 1 !important;
}
</style>
