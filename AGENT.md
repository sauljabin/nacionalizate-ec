# AGENT.md

Guía para agentes de IA (y personas) que trabajen en este repositorio.

## Qué es

Una página estática para practicar el examen de nacionalización ecuatoriana. Se publica con GitHub Pages desde `docs/` en <https://github.com/sauljabin/nacionalizate-ec>. Todas las preguntas están en `docs/data/cards.json`, que se edita a mano.

Las preguntas vinieron originalmente de una exportación de RemNote. El conversor (`scripts/convert_remnote.py`) y su documentación se quitaron del repositorio; si alguna vez hace falta volver a convertir una exportación, recupéralos del historial de git (commit `85e5832`).

Mantén siempre estos avisos en el README y en el pie de la página: el proyecto es **completamente gratuito**, tiene **fines exclusivamente pedagógicos** y **no es material oficial**.

## Convenciones

- **Código en inglés:** variables, funciones, comentarios y mensajes de los scripts.
- **Documentación y página en español:** README, este archivo, plantillas de issues y todo el texto que se ve en la página (`docs/`).
- **Terminología:** escribe siempre «nacionalización», nunca «naturalización». La única excepción es el nombre del trámite oficial, «carta de naturalización», cuando se enlaza a gob.ec.
- **Etiquetas de GitHub en español:** `error`, `incluir pregunta`, `mejora`, `accesibilidad`, `documentación`, `duda`, `duplicado`, `no válido`, `no se hará`, `se busca ayuda`, `buen primer aporte`. Las plantillas de `.github/ISSUE_TEMPLATE/` usan las tres primeras.

## Estructura

| Ruta | Qué contiene |
|---|---|
| `docs/index.html`, `app.js`, `styles.css` | La página. JavaScript sin frameworks ni compilación. |
| `docs/sw.js`, `docs/manifest.webmanifest`, `docs/icons/` | Uso sin conexión (service worker) e instalación como app. |
| `docs/fonts/` | Las fuentes (Atkinson Hyperlegible y Fraunces, solo el subconjunto latino) y sus licencias OFL. La app no hace pedidos a otros servidores: no agregues fuentes, scripts ni imágenes externas. |
| `scripts/build_part_images.py`, `assets/` | Generador de las imágenes de las partes del escudo y de la bandera, y los SVG oficiales que usa. |
| `scripts/build_inventory.py` | Vista de solo lectura de `cards.json` en `scripts/inventory.html`: todas las preguntas con su popularidad, exámenes e imagen, con filtros por texto, tema, imagen y popularidad, y las fotos agrupadas y numeradas con su licencia. Solo para desarrollo: git lo ignora y la app no lo enlaza. |
| `scripts/build_capital_maps.py` | Generador de los mapas de *Capitales en el mapa* (`docs/images/capital-*.svg`) a partir de `mapa-provincias.svg`. |
| `scripts/build_province_map.py` | Generador del mapa de «Mapa de provincias» (`docs/images/mapa-provincias.svg`) a partir de `assets/provinces-of-ecuador.svg`. |
| `docs/audio/` | El himno instrumental de «Símbolos patrios». |
| `docs/data/cards.json` | Todas las preguntas. Es la fuente de verdad: edítalo directamente. |
| `docs/images/` | Imágenes de las preguntas, referenciadas desde `cards.json` con rutas relativas (`images/…`). |
| `.github/ISSUE_TEMPLATE/` | Formularios de issues. `app.js` enlaza a `error.yml` y `incluir-pregunta.yml` y rellena el campo `pregunta` por URL. |

## Formato de `docs/data/cards.json`

```json
{
  "categories": [{
    "id": "simbolos-patrios",
    "title": "Símbolos Patrios",
    "subcategories": [{
      "id": "bandera-nacional",
      "title": "Bandera Nacional",
      "cards": [
        {"id": "…", "type": "basic", "front": [Segment], "back": [Segment]},
        {"id": "…", "type": "cloze", "front": [Segment]},
        {"id": "…", "type": "choice", "front": [Segment], "options": ["A", "B", "C", "D"], "answer": 0,
         "explanation": "…"},
        {"id": "…", "type": "choice", "front": [Segment], "options": ["A", "B", "C", "D"], "answer": [0, 2]},
        {"id": "…", "type": "image", "front": [Segment],
         "image": {"src": "images/x.png", "width": 790, "height": 592,
                   "blocks": [{"x": 0.5, "y": 0.1, "width": 0.4, "height": 0.3, "active": true}]}}
      ]
    }]
  }]
}
```

- `Segment` es `{"text", "bold"?, "color"?, "cloze"?}`; `cloze: true` marca el texto que queda oculto hasta revelar la respuesta.
- Una tarjeta puede tener `topic` (carpetas por debajo de la subcategoría).
- Los `id` de categoría y subcategoría nacen del título en minúsculas, sin tildes y con guiones (`simbolos-patrios`). Si después cambias el título, deja el `id` como estaba (por ejemplo, «1941 Guerra con el Perú» sigue con `1941-la-guerra-del-41`): los enlaces `#temas=` lo usan.
- Los `id` de tarjeta deben ser únicos; aparecen en los reportes de error. Para una tarjeta nueva, usa cualquier cadena única. **No cambies el `id` de una tarjeta existente:** las listas de falladas y marcadas se guardan por `id`, y los exámenes compartidos usan en el enlace un código de 6 caracteres calculado a partir del `id` (`shortCode` en `app.js`). Si dos tarjetas dieran el mismo código, la consola del navegador muestra un error; cambia el `id` de la tarjeta nueva.
- `type: "basic"` necesita `front` y `back`. `type: "cloze"` necesita al menos un segmento con `cloze: true`. `type: "choice"` necesita `options` (de 2 a 4 textos) y `answer`: el índice de la correcta, o una lista de índices si hay varias correctas (entonces la página avisa «Varias respuestas: marca todas las correctas», usa marcas cuadradas en vez de redondas y muestra el botón **Comprobar**). Las opciones aparecen en orden aleatorio. Úsalo cuando una pregunta abierta tendría varias respuestas válidas o cuando es fácil confundir la respuesta con un dato parecido.
- `explanation` (opcional, solo en `choice`) es un texto corto que aparece al responder. Úsalo para no perder el contexto que tendría una respuesta abierta: por qué las otras opciones no son correctas, la lista completa o un dato que ayude a recordar. `type: "image"` necesita `image` con exactamente un bloque `active: true`, que es el que se revela, y un `front` con el enunciado (por ejemplo, «¿Cuál es la capital de esta provincia?»): sin él no se entiende qué se pregunta.
- `popularity` (opcional, va después de `id`) es cuántas veces aparece el dato en las guías de estudio públicas que se usaron para los exámenes recomendados. Sin el campo, cuenta como 0. El simulacro saca la mitad de sus preguntas de las que tienen 2 o más. Si juntas dos preguntas repetidas, suma sus valores en la que queda.
- `photo` (opcional) es una foto que aparece al revelar la respuesta: `{"src", "alt", "credit", "license", "url"}`. `url` es la página del archivo en Wikimedia Commons y `credit` nombra a quien hizo la foto; la página muestra los dos bajo la foto. Para dibujos (banderas, escudos, mapas) añade `"title"` con el nombre del archivo en Commons: el pie dice entonces «Imagen basada en «title»» en vez de «Foto:». La misma imagen puede ir en varias preguntas; reutilízala antes de añadir otra.
- `image` lleva también la obra de Wikimedia Commons en que se basa la imagen: `"title"` (el nombre del archivo), `"license"`, `"url"` y, si la licencia pide nombrar al autor, `"credit"`. La página los muestra bajo la imagen. Toda imagen basada en una obra de terceros debe llevarlos.
- `exams` (al final del archivo, junto a `categories`) son los exámenes recomendados de «Mis exámenes»: `{"id", "title", "ids": [id de tarjeta, …]}`. Se generaron contando cuántas veces aparece cada pregunta en guías de estudio públicas (mazos de Quizlet) que arma gente que ya dio el examen oficial: «Lo esencial» tiene las 30 que más aparecen, «Lo importante» las 30 siguientes, «Para reforzar» las otras 30 y «Complementarias» las 30 que siguen (con 2 o 3 apariciones), con una sola tarjeta de huecos por texto. Los ids `recomendado-1` a `recomendado-4` no cambian aunque cambie el título. Se pueden editar a mano; si borras una tarjeta, quítala también de `exams`. Un enlace compartido con exactamente las mismas preguntas se reconoce como recomendado.
- `summary` (opcional, en las subcategorías de Historia) es el resumen que muestra la «Línea de tiempo». La página toma el año del principio del título («1809 Primer Grito de Independencia»); los subtemas sin año van al final, en «También en Historia», salvo «Época prehispánica», que va primero. Escríbelo a partir de las preguntas del subtema, para que no diga nada que las preguntas no respalden.
- `color` admite `red`, `orange`, `yellow`, `green`, `purple`, `blue`, `gray`, `brown` y `pink`.
- `docs/data/cards.schema.json` es el JSON Schema de este formato, y `cards.json` lo enlaza con `"$schema"` (deja esa clave primero). Si agregas o cambias un campo, actualiza el schema en el mismo cambio. El schema no puede comprobar que los `id` sean únicos, que `answer` apunte a una opción que existe ni que los `ids` de `exams` existan.
- Después de editar, comprueba el archivo: `uvx check-jsonschema --schemafile docs/data/cards.schema.json docs/data/cards.json`. Sin uv, al menos comprueba que el JSON es válido: `python3 -m json.tool docs/data/cards.json > /dev/null`.

## Estilo de las preguntas

- Toda respuesta de pregunta y respuesta termina en punto, también después de un paréntesis o de comillas; las que terminan en «!» o «?» se dejan así. En las respuestas con viñetas, cada línea termina en punto.
- Las respuestas empiezan con mayúscula.
- Las preguntas llevan los dos signos: «¿…?». Las frases para completar («El día de la Bandera se celebra el») no llevan signos.
- Usa comillas españolas: «…», no comillas rectas.
- Los títulos de secciones van en primera persona («Mi progreso», «Mis exámenes», «Mis datos»); los textos que explican o piden algo se dirigen a la persona de tú («respondiste», «toca»).
- La página no explica cómo se eligen las preguntas: nada de popularidad, de cuántas veces se repiten ni de guías de estudio. Eso solo va en la documentación.
- Usa lenguaje neutro, sin masculino genérico: «llegarás con más confianza» en vez de «estarás preparado», «las personas menores de edad» en vez de «los menores». Si no hay forma neutra, usa el femenino («estarás preparada»). Los datos históricos y las citas, como la letra del himno, quedan como son.
- Prefiere preguntas de selección, como en el examen real. Las opciones falsas deben ser datos reales que se confunden con facilidad (otra fecha patria, otro presidente, otra provincia vecina), nunca otra respuesta que también sea correcta; usa `explanation` para aclarar a qué corresponde cada una. Las que piden una lista también van como selección: varias respuestas correctas y una falsa, que la explicación aclara. Los huecos quedan solo para la letra cantada del himno, y las imágenes para las partes del escudo y de la bandera y las capitales en el mapa; esas no salen en el simulacro, así que cada una debe tener también su pregunta de selección sin imagen.
- Las funciones del Estado se llaman como en la Constitución: «Función Ejecutiva», «Función Legislativa», «Función Judicial», «Función Electoral» y «Función de Transparencia y Control Social», no «Poder…».
- Escribe «Cusco», «océano Pacífico» y «Constitución» con mayúscula cuando nombra una constitución concreta («la Constitución de 2008»).
- Las opciones de las preguntas de selección no llevan punto final.
- Las explicaciones dan el dato y, si hace falta, su fuente (por ejemplo, la Constitución o un informe oficial). No digas de dónde salió la pregunta: nada de «según las guías de estudio» ni de mazos o páginas de práctica.
- Si dos preguntas piden el mismo dato con otras palabras, deja una sola y pasa a su explicación lo que la otra tenía de más. Sí valen el mismo dato con y sin imagen (partes del escudo y de la bandera, capitales en el mapa) y las preguntas inversas («¿Quién escribió Cumandá?» y «¿Qué novela escribió Mera en 1879?»).

## Comandos

```bash
# Servir la página en local
python3 -m http.server 8000 --directory docs
```

## Reglas

- Usa solo rutas relativas en `docs/`: GitHub Pages sirve el sitio bajo `/<repo>/`.
- La página debe funcionar en escritorio y en teléfonos (desde 360 px de ancho), con todos los tamaños de letra y sin desplazamiento horizontal. Pruébala en modo móvil con la letra más grande.
- Accesibilidad: las preferencias se guardan como atributos `data-*` en `<html>` (`data-font-size`, `data-theme`, `data-spacing`, `data-contrast`, `data-motion`) y en `localStorage`. Usa unidades `rem` para que el tamaño de letra escale todo. Todo debe poder usarse con teclado.
- Pon una foto solo si ayuda a recordar la respuesta al verla (una persona, un lugar, un plato o una fiesta reconocibles). Un paisaje genérico, una orilla o un tramo de río suman peso a la descarga sin ayudar: déjalos sin foto. No uses fotos con personas reconocibles en primer plano en temas de pueblos indígenas.
- Fotos de las respuestas: usa solo imágenes con licencia libre de Wikimedia Commons (CC0, CC BY, CC BY-SA o dominio público) y guarda siempre autor, licencia y enlace en `photo`. No uses fotos de obras de arte cuyo autor murió hace menos de 70 años (por ejemplo, Guayasamín, Kingman o Egas): la licencia de la foto no cubre la obra. En esos casos usa un retrato del artista o no pongas foto. Guárdalas en `docs/images/foto-<tema>.jpg`, de 900 px de lado como máximo y, mejor, por debajo de 250 KB. Los dibujos pueden ir como `.svg` o `.png` si pesan menos. Para revisar las fotos o la popularidad, genera el inventario con `python3 scripts/build_inventory.py`.
- Las tarjetas de *Partes del Escudo Nacional* y *Partes de la Bandera Nacional* usan SVG generados (`docs/images/escudo-*.svg` y `bandera-*.svg`) con el escudo o la bandera oficiales de `assets/`, un indicador, el nombre de la parte y su descripción. No los edites a mano: cambia `COAT_PARTS` o `FLAG_PARTS` en `scripts/build_part_images.py` y ejecútalo; el script también recalcula en `cards.json` el recuadro que tapa la descripción y escribe la fuente (`COAT_SOURCE`, `FLAG_SOURCE`). El escudo y la bandera de `assets/` son de dominio público en Wikimedia Commons; «Símbolos patrios» muestra ese crédito bajo cada uno. Mantén esos textos coherentes con las tarjetas de texto equivalentes de *Elementos del escudo* y *Bandera Nacional*.
- «Símbolos patrios» (`symbols-template` en `index.html`) tiene su texto escrito en la plantilla, sacado de las preguntas de Símbolos Patrios: si corriges un dato en `cards.json`, corrígelo también ahí. La letra del himno es de dominio público (Juan León Mera, 1865); el audio es la versión instrumental de la Banda de la Marina de los Estados Unidos, de dominio público, de Wikimedia Commons.
- Las tarjetas de *Capitales en el mapa* usan `docs/images/capital-*.svg`: el mapa de provincias con una provincia en rojo, un indicador, su nombre y su capital. No los edites a mano: ejecuta `python3 scripts/build_capital_maps.py` (después de `build_province_map.py`, si cambió el mapa). El script toma nombres y capitales de `PROVINCES` en `app.js`, escribe la imagen, el recuadro que tapa la capital y el crédito en `cards.json`, y los mapas conservan la licencia CC BY-SA 3.0. `POINTS` fija dónde apunta el indicador en cada provincia.
- «Mapa de provincias» usa `docs/images/mapa-provincias.svg`, generado desde «Azuay in Ecuador», de Milenioscuro (CC BY-SA 3.0). Esa licencia obliga a mantener el crédito que muestra la página y a publicar el mapa con la misma licencia, aunque el resto del repositorio sea CC0. No edites el SVG a mano: ejecuta `python3 scripts/build_province_map.py`. Los nombres, capitales y regiones están en `PROVINCES` en `app.js` y deben coincidir con las preguntas de *Capitales de las Provincias* y *Provincias por Región*.
- Botón «atrás» del teléfono: `showScreen()` deja cada pantalla que no es el inicio sobre una entrada del historial (`{ inApp: true }`), y el listener de `popstate` hace lo mismo que el botón para volver de esa pantalla (`BACK_CONTROLS`: «Salir», «Volver…»). Al cambiar la dirección con `history.replaceState`, pasa siempre `history.state`, no `null`, para no perder esa marca. Una pantalla nueva con botón para volver debe usar una de esas clases.
- Sin conexión: `docs/sw.js` pide a la red primero la página y `cards.json` (así las correcciones llegan en la siguiente visita con internet) y usa la caché primero para las imágenes y el audio. Al instalarse guarda todo: las imágenes y fotos que nombra `cards.json` y los archivos de `PAGE_MEDIA` (bandera, escudo, mapa y audio del himno). Si cambias el contenido de una imagen o del audio sin cambiarle el nombre (por ejemplo, al volver a generar `mapa-provincias.svg`), sube `VERSION` en `sw.js`. Si agregas un archivo nuevo a la página, añádelo a `SHELL` (otro `.js` o `.css`) o a `PAGE_MEDIA` (una imagen o un audio que no sale en las preguntas). El audio se pide por partes; el service worker corta de la copia guardada la parte que pide el reproductor.
- El estilo debe ser propio y no imitar a otras aplicaciones de tarjetas de estudio.
- Datos de cada persona: falladas, marcadas, exámenes guardados, el examen a medias, el último resultado de cada pregunta, los días con práctica, las respuestas de cada día (`activity`, para el calendario de «Mi actividad»), cada simulacro terminado (`mocks`: fecha, puntaje y respuestas, hasta `MOCK_HISTORY`, para «Mis simulacros»), las estadísticas y los logros se guardan en `localStorage` (clave `progress`), nunca en un servidor. Los logros están en `ACHIEVEMENTS` en `app.js`; si cambias el `id` de uno, quien ya lo tenía lo pierde (el título sí se puede cambiar). Algunos llevan nombres del cuarenta («¡Caída!», «Limpia», «¡Cuarenta!») o de expresiones ecuatorianas («Con yapa», «Chulla vida», «Mi pana»); un nombre nuevo debe servir para cualquier persona, sin género. «Descargar mis datos» guarda ese objeto en un archivo JSON con `app: "examen-nacionalizacion-ecuatoriana"`; si agregas un campo a `progress`, agrégalo también a `emptyProgress()` para que los archivos viejos sigan cargando.
- Juegos (`// Games` en `app.js`): «Ordena la historia» toma los temas de Historia con año (`timelineEvents()`) y nunca junta dos del mismo año; `ORDER_NAMES` cambia el nombre que se muestra. «Verdadero o falso» arma sus frases con las preguntas de selección de una sola respuesta y sin imagen. «Encuentra las provincias» es `showMap("game")`. Cada juego dice antes de empezar qué hace falta para ganar (`MAP_PASS`, `TF_PASS`, `TF_TIMED_MIN`; en «Ordena la historia», los cinco en su lugar) y al final lo muestra con `gameVerdict()`. Los juegos no llaman a `recordAnswer`, así que no cuentan para el progreso.
- Buscadores y vista previa al compartir: el `<head>` de `index.html` tiene el título con las palabras de búsqueda, la descripción, la dirección canónica (`https://sauljabin.dev/nacionalizate-ec/`), las etiquetas Open Graph y los datos estructurados (`WebApplication`). La sección `.intro` de `<main>` es texto fijo que leen los buscadores que no ejecutan JavaScript; la app la reemplaza al cargar. Si cambia la cantidad de preguntas («más de 700») o lo que ofrece la página, actualiza la descripción, `og:description` y `.intro`. La imagen `docs/icons/og-image.png` (1200×630) sale de `scripts/og-image.html`; el comentario del archivo dice cómo volver a generarla.
- La sección «Dudas y ayuda» (`#dudas-y-ayuda`, al final de `home-template` en `index.html`) resume datos del trámite real. No la llames «Preguntas frecuentes»: se confunde con las preguntas que más salen en el examen. Cada dato debe tener fuente oficial (gob.ec o Cancillería), el texto debe decir «examen oficial» para no confundirlo con la práctica, y la nota de que la información es referencial debe quedarse.
- Los exámenes compartidos van en el fragmento del enlace (`#examen=<códigos>&titulo=<nombre>`), que el navegador no envía a GitHub. Los temas compartidos usan `#temas=` con ids de categoría (`simbolos-patrios`) o de subcategoría (`simbolos-patrios/himno-nacional`) separados por comas; por eso tampoco cambies esos ids.
- El simulacro tiene 30 preguntas y se aprueba con 27 (`MOCK_SIZE` y `MOCK_PASS` en `app.js`), como el examen real según la Cancillería. Solo usa preguntas de selección, como el examen real: `MOCK_POPULAR` (15) entre las que tienen `popularity` de `POPULAR_MIN` (2) o más, sorteadas con más peso para las de más popularidad, y el resto de todos los temas, repartidas por igual. No muestra si acertaste hasta el final ni cuenta aciertos seguidos. Las preguntas de huecos, de imagen y de respuesta abierta no entran: para que entren, conviértelas en selección.
