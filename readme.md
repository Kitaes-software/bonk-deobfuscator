# Bonk deobfuscator
This project deobfuscates the entire [bonk.io](https://bonk.io) code contained within alpha2s.js. It is based on [this](https://github.com/kookywarrior/bonk-deobfuscator) deobfuscator, but it has a lot more!

## This deobfuscator can:
- Decipher the cipher used to obfuscate [bonk.io](https://bonk.io)'s code (your browser has to do it every time something happens)
- Remove unused variables (there are lots of them!)
- Replace variable names with human readable ones as specified in variableNames.ini
- It even replaces some bad code with readable code!
## Deobfuscated code comparison
Obfuscated code:
```js
requirejs(
  [B3jF8.U3q(4353), B3jF8.U3q(393), B3jF8.w65(124)],
  function (E3G, p5h, Q2K) {
    "use strict";
    var k7V = B3jF8;
    var t$e = [arguments];
    t$e[2] = 349182763;
    k7V.t8H();
    t$e[7] = 1310130950;
    t$e[4] = -742434495;
    t$e[8] = -1689431276;
    t$e[3] = 1856419556;
    t$e[9] = 1764162380;
    if (
      !(
        k7V.t$4(0, false, 105006) !== t$e[2] &&
        k7V.t$4(0, false, 314987) !== t$e[7] &&
        k7V.g7y(0, false, 151982) !== t$e[4] &&
        k7V.g7y(0, false, 314471) !== t$e[8] &&
        k7V.t$4(0, false, 766911) !== t$e[3] &&
        k7V.g7y(0, false, 993863) !== t$e[9]
      )
    ) {
      t$e[5] = M$QCc;
      function a9() {
        var N7I = [arguments];
        N7I[4] = M$QCc;
        function R9R(s2W) {
          k7V.n6e();
          var G2Y = [arguments];
          G2Y[7] = M$QCc;
          G2Y[0][0][G2Y[7][361]]();
          if (G2Y[0][0][G2Y[7][1065]]) {
            if (G2Y[0][0][G2Y[7][1066]] < 0) {
              N7I[1][G2Y[7][414]][N7I[7]][G2Y[7][210]] += 1;
            }
            if (G2Y[0][0][G2Y[7][1066]] > 0) {
              N7I[1][G2Y[7][414]][N7I[7]][G2Y[7][210]] -= 1;
            }
          } else {
            if (G2Y[0][0][G2Y[7][1066]] < 0) {
              if (N7I[1][G2Y[7][414]][N7I[7]][G2Y[7][416]] < 0.2) {
                N7I[1][G2Y[7][414]][N7I[7]][G2Y[7][416]] += 0.005;
              } else {
                N7I[1][G2Y[7][414]][N7I[7]][G2Y[7][416]] += 0.01;
              }
            }
            if (G2Y[0][0][G2Y[7][1066]] > 0) {
              if (N7I[1][G2Y[7][414]][N7I[7]][G2Y[7][416]] < 0.2) {
                N7I[1][G2Y[7][414]][N7I[7]][G2Y[7][416]] -= 0.005;
              } else {
                N7I[1][G2Y[7][414]][N7I[7]][G2Y[7][416]] -= 0.01;
              }
            }
          }
          N7I[5][G2Y[7][1044]](N7I[1], N7I[7]);
          V0_();
        }
```
it's unreadable, isn't it? Now let's compare it with deobfuscated code
```js
requirejs(["socketio", "peer.min", "physics/box2dweb/Box2DModuleGJMod"], function(socketio, peerjs, box2d) {
"use strict";
function SkinManager() {
	var editSkin, skinLayerSelectWindow;
	function skinLayerZoom(e) {
		e.preventDefault();
		if (e.shiftKey) {
			if (e.deltaY < 0) {
				editSkin.layers[editSkinLayer].angle += 1;
			}
			if (e.deltaY > 0) {
				editSkin.layers[editSkinLayer].angle -= 1;
			}
		} else {
			if (e.deltaY < 0) {
				if (editSkin.layers[editSkinLayer].scale < 0.2) {
					editSkin.layers[editSkinLayer].scale += 0.005;
				} else {
					editSkin.layers[editSkinLayer].scale += 0.01;
				}
			}
			if (e.deltaY > 0) {
				if (editSkin.layers[editSkinLayer].scale < 0.2) {
					editSkin.layers[editSkinLayer].scale -= 0.005;
				} else {
					editSkin.layers[editSkinLayer].scale -= 0.01;
				}
			}
		}
		skinRenderer.redrawLayer(editSkin, editSkinLayer);
		openLayerProperties();
	}
```
Not only is it way more readable now, it's also considerably shorter!
## Command line arguments
The command line arguments have to be used like this: `node bonkdeobf.js nominify`
| Argument  | Description                         |
|-----------|-------------------------------------|
| nominify  | Do not minify the deobfuscated code |
| noflags   | Do not remove the flag check in code|
## Size comparison
Obfuscated code: 2636 KiB

Deobfuscated + minified code: 1194 KiB

That's more that twice as small! The deobfuscation inflates the game's size by literally more than twice!