// R3-BLOCKER fix: forbidOnly para jest 29.7.
//
// jest 29.7 no soporta `forbidOnly` (ni como flag CLI ni como opción de
// config — la opción nativa llegó en jest 30). Este guard corre en
// setupFilesAfterEnv, cuando el test framework ya está instalado, y hace que
// cualquier `test.only` / `it.only` / `describe.only` / `fit` / `fdescribe`
// accidental falle el run: un test.only que se pushea deja el CI en rojo.
//
// setupFiles NO sirve para esto (corre antes de instalar el framework y los
// globals de test aún no existen); setupFilesAfterEnv corre en cada archivo
// de test antes de que se ejecute su contenido.

const ONLY_MSG = (api) =>
  `[forbidOnly] ${api} no está permitido: un test.only accidental no debe dejar el CI verde. Quitá el .only antes de pushear.`;

function forbidOnly(api) {
  const fn = global[api];
  if (!fn || typeof fn !== "function") return;
  // `test.only` / `describe.only` son propiedades de la función global.
  if (fn.only) {
    Object.defineProperty(fn, "only", {
      configurable: true,
      value: () => {
        throw new Error(ONLY_MSG(`${api}.only`));
      },
    });
  }
}

for (const api of ["test", "it", "describe"]) {
  forbidOnly(api);
}

// fit / fdescribe son alias directos de it.only / describe.only.
for (const api of ["fit", "fdescribe"]) {
  if (typeof global[api] === "function") {
    global[api] = () => {
      throw new Error(ONLY_MSG(api));
    };
  }
}
