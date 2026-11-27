/**
 * @file carpetas.mjs
 * @description (v0.17.1) Gestión de carpetas del sistema sin duplicados.
 *
 * Antes, cada cliente de Master ejecutaba `game.folders.find(...)` + `Folder.create(...)` por su
 * cuenta y sin esperar a las creaciones en curso. En un servidor real (latencia de red, varios
 * Masters o pestañas conectadas, varios Actores creados seguidos) dos llamadas podían no ver la
 * carpeta todavía y crearla las dos. Este módulo:
 * - Serializa la creación por `tipo + nombre` dentro del cliente (`obtenerOCrearCarpeta`).
 * - Permite fusionar al arrancar las carpetas duplicadas que ya existan (`fusionarCarpetasDuplicadas`).
 * La restricción "solo el Master activo" (`game.users.activeGM`) la aplican los hooks que llaman aquí.
 */

/**
 * Creaciones de carpeta en curso en este cliente, por clave `tipo|nombre`.
 * @type {Map<string, Promise<Folder>>}
 */
const creacionesEnCurso = new Map();

/**
 * Busca una carpeta raíz por tipo y nombre (la más antigua si hubiera varias).
 * @param {string} tipo - Tipo de documento de la carpeta ("Actor", "Cards"...).
 * @param {string} nombre - Nombre exacto.
 * @returns {Folder|undefined}
 */
export function buscarCarpeta(tipo, nombre) {
  return game.folders
    .filter(f => f.type === tipo && f.name === nombre && !f.folder)
    .sort((a, b) => (a._stats?.createdTime ?? 0) - (b._stats?.createdTime ?? 0))[0];
}

/**
 * Devuelve la carpeta raíz `tipo`/`nombre`, creándola si no existe. Las llamadas simultáneas
 * con la misma clave esperan a la misma creación en lugar de crear otra carpeta.
 * @param {string} tipo - Tipo de documento de la carpeta.
 * @param {string} nombre - Nombre de la carpeta.
 * @param {string} [color] - Color de la carpeta al crearla.
 * @returns {Promise<Folder>}
 */
export async function obtenerOCrearCarpeta(tipo, nombre, color) {
  const existente = buscarCarpeta(tipo, nombre);
  if (existente) return existente;

  const clave = `${tipo}|${nombre}`;
  if (creacionesEnCurso.has(clave)) return creacionesEnCurso.get(clave);

  const promesa = (async () => {
    try {
      return buscarCarpeta(tipo, nombre) ?? await Folder.create({ name: nombre, type: tipo, ...(color ? { color } : {}) });
    } finally {
      creacionesEnCurso.delete(clave);
    }
  })();
  creacionesEnCurso.set(clave, promesa);
  return promesa;
}

/**
 * Fusiona las carpetas raíz duplicadas (mismo tipo y nombre) que crearon versiones anteriores:
 * mueve sus documentos y subcarpetas a la más antigua y borra las demás.
 * Solo debe llamarla el Master activo (hook `ready`).
 * @param {string} tipo - Tipo de documento de las carpetas.
 * @param {(nombre: string) => boolean} filtroNombre - Qué nombres se revisan.
 * @returns {Promise<number>} Nº de carpetas duplicadas eliminadas.
 */
export async function fusionarCarpetasDuplicadas(tipo, filtroNombre) {
  const grupos = new Map();
  for (const carpeta of game.folders.filter(f => f.type === tipo && !f.folder && filtroNombre(f.name))) {
    if (!grupos.has(carpeta.name)) grupos.set(carpeta.name, []);
    grupos.get(carpeta.name).push(carpeta);
  }

  const coleccion = game.collections.get(tipo);
  const aBorrar = [];
  for (const [nombre, carpetas] of grupos) {
    if (carpetas.length < 2) continue;
    const destino = buscarCarpeta(tipo, nombre);
    for (const duplicada of carpetas.filter(c => c !== destino)) {
      const documentos = coleccion?.filter(d => d.folder?.id === duplicada.id) ?? [];
      if (documentos.length) {
        await coleccion.documentClass.updateDocuments(documentos.map(d => ({ _id: d.id, folder: destino.id })));
      }
      const subcarpetas = game.folders.filter(f => f.folder?.id === duplicada.id);
      if (subcarpetas.length) {
        await Folder.updateDocuments(subcarpetas.map(f => ({ _id: f.id, folder: destino.id })));
      }
      aBorrar.push(duplicada.id);
    }
  }
  if (aBorrar.length) await Folder.deleteDocuments(aBorrar);
  return aBorrar.length;
}
