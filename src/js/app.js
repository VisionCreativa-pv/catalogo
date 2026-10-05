
/* =========================================================
   VISIÓN CREATIVA — APP
========================================================= */

import {
    cargarCatalogo,
    cargarConfiguracion
} from './catalogo.js';

import {
    renderizarRecomendaciones
} from './components/recomendaciones.js';

import {
    renderizarColecciones
} from './components/colecciones.js';

import {
    abrirProducto,
    abrirPanelComercial,
    cerrarProducto,
    inicializarProductoView
} from './components/producto-view.js';

import { obtenerColoresPorGenero } from './motor/colores.js';

let tallasConfiguradasCache = null;

async function cargarTallasConfiguradas() {
    if (tallasConfiguradasCache) return tallasConfiguradasCache;

    try {
        const respuesta = await fetch('./data/tallas.json', { cache: 'no-store' });
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        const datos = await respuesta.json();
        tallasConfiguradasCache = Array.isArray(datos.tallas) ? datos.tallas : [];
    } catch (error) {
        console.warn('No se pudieron cargar data/tallas.json; usaré tallas comunes.', error);
        tallasConfiguradasCache = [];
    }

    return tallasConfiguradasCache;
}

function normalizarGeneroTalla(genero) {
    const valor = String(genero || '').trim().toLocaleLowerCase('es-MX');
    return ({ 'niño': 'nino', 'niños': 'nino', 'juvenil': 'joven', 'bebé': 'bebe' })[valor] || valor;
}


async function activarTemaVisual(configuracion) {
    const nombreTema = String(configuracion?.home?.tema || 'default')
        .trim()
        .toLowerCase();
    const raiz = document.documentElement;
    const idHoja = 'active-theme-stylesheet';
    document.getElementById(idHoja)?.remove();
    const logoTema = configuracion?.temas?.[nombreTema]?.logo || configuracion?.marca?.logo;
    const aplicarLogoTema = () => {
        if (!logoTema) return;
        const ruta = `./${String(logoTema).replace(/^\.\//, '')}`;
        document.querySelectorAll('.home-logo-image').forEach(logo => {
            logo.src = ruta;
        });
    };

    if (nombreTema === 'default') {
        raiz.dataset.theme = 'default';
        aplicarLogoTema();
        return;
    }

    if (!/^[a-z0-9_-]+$/.test(nombreTema)) {
        console.warn(`Nombre de tema no válido: ${nombreTema}`);
        raiz.dataset.theme = 'default';
        return;
    }

    const hoja = document.createElement('link');
    hoja.id = idHoja;
    hoja.rel = 'stylesheet';
    hoja.href = `./css/temas/${encodeURIComponent(nombreTema)}.css`;

    const cargada = await new Promise(resolve => {
        hoja.onload = () => resolve(true);
        hoja.onerror = () => resolve(false);
        document.head.append(hoja);
    });

    if (!cargada) {
        hoja.remove();
        raiz.dataset.theme = 'default';
        console.warn(`No se encontró la hoja visual del tema "${nombreTema}".`);
        return;
    }

    raiz.dataset.theme = nombreTema;
    aplicarLogoTema();

    const imagenSinResultados = configuracion?.temas?.[nombreTema]?.busqueda?.imagenSinResultados;
    const imagen = document.querySelector('#homeSearchEmpty img');
    if (imagenSinResultados && imagen) {
        imagen.src = `./${String(imagenSinResultados).replace(/^\.\//, '')}`;
    }
}


function actualizarBotonHeaderDetalles(abierto) {
    const boton = document.getElementById('headerSearchButton');
    const icono = document.getElementById('headerSearchIcon');
    const header = document.querySelector('#catalogHome .home-topbar');
    const usarFlecha = abierto && window.matchMedia('(max-width: 1024px)').matches;
    header?.classList.toggle('details-open', usarFlecha);
    if (!boton || !icono) return;
    boton.setAttribute('aria-label', usarFlecha ? 'Cerrar detalles' : 'Buscar');
    icono.innerHTML = usarFlecha
        ? '<path d="M19 12H5M11 18l-6-6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
        : '<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="M16.2 16.2L21 21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
}

function resetearSelectorColoresDetalles() {
    const seccion = document.getElementById('homeProductDetails');
    const opciones = seccion?.querySelector('.details-options');
    opciones?.classList.remove('colors-expanded');
    seccion?.classList.remove('color-selection-mode');
    document.getElementById('detailsColorBrowser')?.setAttribute('aria-hidden', 'true');
    document.getElementById('detailsColorExpand')?.setAttribute('aria-expanded', 'false');
    document.getElementById('detailsAddCart')?.classList.remove('is-saving-color');
    const etiqueta = document.getElementById('detailsAddCartLabel');
    if (etiqueta) etiqueta.textContent = 'Agregar a cotización';
}

function notificarDetalles(mensaje) {
    let aviso = document.getElementById('detailsFeedbackToast');
    if (!aviso) {
        aviso = document.createElement('div');
        aviso.id = 'detailsFeedbackToast';
        aviso.className = 'details-feedback-toast';
        aviso.setAttribute('role', 'status');
        aviso.setAttribute('aria-live', 'polite');
        document.body.append(aviso);
    }
    aviso.textContent = mensaje;
    aviso.classList.add('is-visible');
    window.clearTimeout(notificarDetalles.timer);
    notificarDetalles.timer = window.setTimeout(() => aviso.classList.remove('is-visible'), 2600);
}

function inicializarBusqueda(catalogo, configuracion) {
    const panel = document.getElementById('homeSearchPanel');
    const input = document.getElementById('homeSearchInput');
    const status = document.getElementById('homeSearchStatus');
    const emptyState = document.getElementById('homeSearchEmpty');
    const toggleButton = document.getElementById('headerSearchButton');
    const home = document.getElementById('catalogHome');
    const header = toggleButton?.closest('.home-topbar');
    if (!panel || !input || !status || !toggleButton || !home || !header) return;

    const normalizar = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX').trim();
    let scrollResultadosTimer;
    const desplazarAResultado = () => {
        const primero = [...document.querySelectorAll('#homeDesignGrid .home-category-block')]
            .find(block => block.classList.contains('search-first-result'));
        if (!primero && emptyState && !emptyState.hidden) {
            home.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        const destino = primero?.querySelector('.home-category-block-head') || primero || emptyState;
        if (!destino) return;
        const homeRect = home.getBoundingClientRect();
        const destinoRect = destino.getBoundingClientRect();
        const espacio = window.matchMedia('(max-width: 1024px)').matches ? 40 : 12;
        const top = home.scrollTop + destinoRect.top - homeRect.top - header.offsetHeight - espacio;
        home.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    };
    const actualizarResultados = () => {
        const query = normalizar(input.value);
        const cards = [...document.querySelectorAll('#homeDesignGrid .home-card')];
        let total = 0;
        cards.forEach(card => {
            const coincide = !query || normalizar(card.dataset.search || card.textContent).includes(query);
            card.classList.toggle('search-hidden', !coincide);
            if (coincide) total++;
        });
        const bloques = [...document.querySelectorAll('#homeDesignGrid .home-category-block')];
        bloques.forEach(block => {
            block.classList.toggle('search-empty', !block.querySelector('.home-card:not(.search-hidden)'));
            block.classList.remove('search-first-result');
        });
        if (query) {
            bloques.find(block => !block.classList.contains('search-empty'))?.classList.add('search-first-result');
        }
        if (emptyState) emptyState.hidden = !query || total > 0;
        status.hidden = !query;
        status.textContent = total
            ? `${total} ${total === 1 ? 'diseño encontrado' : 'diseños encontrados'}`
            : 'No encontramos diseños con esa búsqueda.';
        window.clearTimeout(scrollResultadosTimer);
        if (query) {
            scrollResultadosTimer = window.setTimeout(() => {
                window.requestAnimationFrame(desplazarAResultado);
            }, 140);
        }
    };

    const cerrarBusqueda = () => {
        home.classList.remove('search-active');
        header.classList.remove('search-active');
        input.value = '';
        document.querySelectorAll('.search-hidden').forEach(card => card.classList.remove('search-hidden'));
        document.querySelectorAll('.search-empty').forEach(block => block.classList.remove('search-empty'));
        document.querySelectorAll('.search-first-result').forEach(block => block.classList.remove('search-first-result'));
        if (emptyState) emptyState.hidden = true;
        status.hidden = true;
        status.textContent = '';
        toggleButton.setAttribute('aria-expanded', 'false');
        toggleButton.setAttribute('aria-label', 'Buscar');
        const icon = document.getElementById('headerSearchIcon');
        if (icon) icon.innerHTML = '<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="M16.2 16.2L21 21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
        window.setTimeout(() => {
            if (!header.classList.contains('search-active')) panel.hidden = true;
        }, 340);
    };

    toggleButton.addEventListener('click', () => {
        if (window.matchMedia('(max-width: 1024px)').matches && document.getElementById('homeProductDetails')?.classList.contains('is-open')) {
            cerrarDetallesProducto();
            return;
        }
        if (header.classList.contains('search-active')) {
            cerrarBusqueda();
            return;
        }
        renderizarColecciones(catalogo, configuracion);
        panel.hidden = false;
        home.classList.add('search-active');
        toggleButton.setAttribute('aria-expanded', 'true');
        toggleButton.setAttribute('aria-label', 'Cerrar búsqueda');
        const icon = document.getElementById('headerSearchIcon');
        if (icon) icon.innerHTML = '<path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
        window.requestAnimationFrame(() => {
            header.classList.add('search-active');
            window.requestAnimationFrame(() => input.focus({ preventScroll: true }));
        });
    });
    document.addEventListener('click', event => {
        if (panel.hidden || !header.classList.contains('search-active')) return;
        if (event.target.closest('#homeDesignGrid .home-card')) cerrarBusqueda();
    }, true);
    input.addEventListener('input', actualizarResultados);
    panel.addEventListener('submit', event => event.preventDefault());
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !panel.hidden) cerrarBusqueda();
    });
}


/* =========================================================
   DETALLES DEL PRODUCTO
========================================================= */

async function abrirDetallesProducto(producto, seleccionInicial = null, quoteKey = null) {

    const etiquetaAccion = quoteKey ? 'Guardar cambios' : 'Agregar a cotización';

    resetearSelectorColoresDetalles();

    const seccion = document.getElementById('homeProductDetails');

    if (!seccion || !producto) {
        console.error(
            'No se encontró la sección Detalles o el producto.'
        );
        return;
    }

    const catalogHome = document.getElementById('catalogHome');
    if (catalogHome?.classList.contains('category-view-active')) {
        seccion.dataset.restoreCategoryView = 'true';
        catalogHome.classList.remove('category-view-active');
    }

    const elemento = (id) => document.getElementById(id);
    seccion.classList.remove('color-selection-mode');
    elemento('detailsAddCart')?.classList.remove('is-saving-color');
    if (elemento('detailsAddCartLabel')) elemento('detailsAddCartLabel').textContent = etiquetaAccion;


    /* -----------------------------------------------------
       INFORMACIÓN
    ----------------------------------------------------- */

    const categoria = elemento('detailsCategory');
    const nombre = elemento('detailsName');
    const sku = elemento('detailsSku');
    const descripcion = elemento('detailsDescription');
    const precio = elemento('detailsPrice');

    if (categoria) {
        categoria.textContent = producto.category || 'Colección';
    }
    const categoriaEnImagen = elemento('detailsImageCategory');
    if (categoriaEnImagen) categoriaEnImagen.textContent = producto.category || 'Colección';

    if (nombre) {
        nombre.textContent = producto.sku || producto.numero || '';
    }

    if (sku) {
        sku.textContent = producto.sku || '';
    }

    if (descripcion) {
        descripcion.textContent = 'Playera de cuello redondo, confeccionada en algodón 100%.';
    }
    const descripcionEnImagen = elemento('detailsImageDescription');
    if (descripcionEnImagen) descripcionEnImagen.textContent = descripcion?.textContent || 'Playera de cuello redondo, confeccionada en algodón 100%.';

    if (precio) {
        const valor = Number(producto.price);
        const mostrarPrecio = Number.isFinite(valor) && valor > 0;
        precio.hidden = !mostrarPrecio;
        precio.textContent = mostrarPrecio
            ? valor.toLocaleString('es-MX', {
                style: 'currency',
                currency: 'MXN'
            })
            : '';
    }


    /* -----------------------------------------------------
       IMÁGENES
    ----------------------------------------------------- */

    const imagenBase = elemento('detailsShirtBase');
    const imagenEstampado = elemento('detailsShirtPrint');

    if (imagenBase) {
        imagenBase.src =
            producto.baseImage ||
            './hero/playeras/playera-frente.png';
    }

    let imagenBaseOriginal = imagenBase?.src || '';
    const aplicarColorPlayera = (hex) => {
        if (!imagenBase || !imagenBaseOriginal || !hex) return;
        if (hex.toLowerCase() === '#ffffff') {
            imagenBase.src = imagenBaseOriginal;
            return;
        }
        const fuente = new Image();
        fuente.onload = () => {
            const lienzo = document.createElement('canvas');
            lienzo.width = fuente.naturalWidth;
            lienzo.height = fuente.naturalHeight;
            const contexto = lienzo.getContext('2d', { willReadFrequently: true });
            if (!contexto) return;
            contexto.drawImage(fuente, 0, 0);
            const pixeles = contexto.getImageData(0, 0, lienzo.width, lienzo.height);
            const tono = hex.match(/[\da-f]{2}/gi)?.map(par => parseInt(par, 16)) || [255, 255, 255];
            for (let i = 0; i < pixeles.data.length; i += 4) {
                if (pixeles.data[i + 3] === 0) continue;
                if (hex.toLowerCase() === '#000000') {
                    pixeles.data[i] = 255 - pixeles.data[i];
                    pixeles.data[i + 1] = 255 - pixeles.data[i + 1];
                    pixeles.data[i + 2] = 255 - pixeles.data[i + 2];
                } else {
                    pixeles.data[i] = tono[0] * pixeles.data[i] / 255;
                    pixeles.data[i + 1] = tono[1] * pixeles.data[i + 1] / 255;
                    pixeles.data[i + 2] = tono[2] * pixeles.data[i + 2] / 255;
                }
            }
            contexto.putImageData(pixeles, 0, 0);
            imagenBase.src = lienzo.toDataURL('image/png');
        };
        fuente.src = imagenBaseOriginal;
    };

    if (imagenEstampado) {
        imagenEstampado.src = producto.printImage || '';
        imagenEstampado.hidden = !producto.printImage;
        imagenEstampado.classList.toggle('print-top', producto.printPosition === 'top');
        imagenEstampado.classList.toggle('print-center', producto.printPosition !== 'top');
        imagenEstampado.classList.toggle('print-back', producto.printView === 'back');
        imagenEstampado.classList.toggle('print-front', producto.printView !== 'back');
        imagenEstampado.classList.toggle('contraste-blanco', producto.printNeedsContrast === true);
    }


    /* -----------------------------------------------------
       TALLAS
    ----------------------------------------------------- */

    const contenedorTallas = elemento('detailsSizes');
    let tallaSeleccionada = '';
    const tallasCatalogo = await cargarTallasConfiguradas();
    const tallasProducto = Array.isArray(producto.sizes)
        ? new Set(producto.sizes.map(talla => String(talla).trim().toUpperCase()))
        : null;
    const tallasFallback = ['CH', 'M', 'G', 'EG', '2XL', '3XL'].map(id => ({
        id,
        nombre: id,
        generos: ['dama', 'caballero', 'joven', 'nino']
    }));
    const renderizarTallas = (genero) => {
        if (!contenedorTallas) return;
        const generoNormalizado = normalizarGeneroTalla(genero);
        const lista = tallasCatalogo.length ? tallasCatalogo : tallasFallback;
        contenedorTallas.replaceChildren();
        tallaSeleccionada = '';

        lista.forEach(talla => {
            const id = String(talla.id || talla.nombre || '').trim().toUpperCase();
            if (!id) return;

            const generos = Array.isArray(talla.generos)
                ? talla.generos.map(normalizarGeneroTalla)
                : [];
            const compatibleGenero = generos.includes(generoNormalizado);
            const compatibleProducto = !tallasProducto || tallasProducto.has(id);
            const boton = document.createElement('button');
            boton.type = 'button';
            boton.className = 'details-size';
            boton.dataset.size = id;
            boton.setAttribute('aria-pressed', 'false');
            boton.textContent = talla.nombre || id;
            boton.disabled = !compatibleGenero || !compatibleProducto;
            boton.setAttribute('aria-disabled', String(boton.disabled));
            boton.addEventListener('click', () => {
                if (boton.disabled) return;
                tallaSeleccionada = id;
                contenedorTallas.querySelectorAll('button').forEach(item => {
                    item.classList.remove('active');
                    item.setAttribute('aria-pressed', 'false');
                });
                boton.classList.add('active');
                boton.setAttribute('aria-pressed', 'true');
            });
            contenedorTallas.appendChild(boton);
        });
    };


    /* -----------------------------------------------------
       COLORES
    ----------------------------------------------------- */

    const contenedorColores = elemento('detailsColors');
    let colorSeleccionado = null;
    const controlesVista = elemento('detailsViewControls');
    const imagenesGaleria = Array.isArray(producto.galleryImages) ? producto.galleryImages : [];
    const vistaFrente = imagenesGaleria.find(imagen => imagen.vista === 'front') || {
        vista: 'front',
        url: producto.printImage || '',
        baseImage: producto.baseImage || './hero/playeras/playera-frente.png',
        posicion: producto.printPosition || 'center',
        necesitaContraste: producto.printNeedsContrast === true
    };
    const vistaEspalda = imagenesGaleria.find(imagen => imagen.vista === 'back') || null;
    const botonVistaFrente = elemento('detailsViewPrev');
    const botonVistaEspalda = elemento('detailsViewNext');
    const etiquetaVista = elemento('detailsViewLabel');
    const aplicarVistaDetalle = imagen => {
        if (!imagen) return;
        const esEspalda = imagen.vista === 'back';
        if (imagenBase) {
            imagenBase.src = imagen.baseImage || (esEspalda ? './hero/playeras/playera-espalda.png' : './hero/playeras/playera-frente.png');
            imagenBaseOriginal = imagenBase.src;
        }
        if (imagenEstampado) {
            imagenEstampado.src = imagen.url || '';
            imagenEstampado.hidden = !imagen.url;
            imagenEstampado.classList.toggle('print-top', imagen.posicion === 'top');
            imagenEstampado.classList.toggle('print-center', imagen.posicion !== 'top');
            imagenEstampado.classList.toggle('print-back', esEspalda);
            imagenEstampado.classList.toggle('print-front', !esEspalda);
            imagenEstampado.classList.toggle('contraste-blanco', imagen.necesitaContraste === true || producto.printNeedsContrast === true);
        }
        if (etiquetaVista) etiquetaVista.textContent = esEspalda ? 'Espalda' : 'Frente';
        if (controlesVista) controlesVista.hidden = !vistaEspalda;
        if (botonVistaFrente) botonVistaFrente.disabled = !esEspalda;
        if (botonVistaEspalda) botonVistaEspalda.disabled = esEspalda;
        if (colorSeleccionado?.hex) aplicarColorPlayera(colorSeleccionado.hex);
    };
    if (botonVistaFrente) botonVistaFrente.onclick = () => aplicarVistaDetalle(vistaFrente);
    if (botonVistaEspalda) botonVistaEspalda.onclick = () => aplicarVistaDetalle(vistaEspalda);
    aplicarVistaDetalle(vistaFrente);
    const expandir = elemento('detailsColorExpand');
    const browser = elemento('detailsColorBrowser');
    const listaBrowser = elemento('detailsColorBrowserList');
    const opciones = contenedorColores?.closest('.details-options');
    const swatchElegido = elemento('detailsColorSelectedSwatch');
    const nombreElegido = elemento('detailsColorSelectedName');
    const selectorColor = elemento('detailsColorSelection');
    const deslizarPanelColores = (expandido) => {
        opciones?.classList.toggle('colors-expanded', expandido);
    };
    const abrirPanelColores = () => {
        const home = document.getElementById('catalogHome');
        const scrollHome = home?.scrollTop ?? 0;
        const scrollPagina = window.scrollY;
        deslizarPanelColores(true);
        browser?.setAttribute('aria-hidden', 'false');
        expandir?.setAttribute('aria-expanded', 'true');
        seccion.classList.add('color-selection-mode');
        const etiqueta = elemento('detailsAddCartLabel');
        if (etiqueta) etiqueta.textContent = 'Guardar color';
        elemento('detailsAddCart')?.classList.add('is-saving-color');

        const conservarVista = () => {
            if (!opciones?.classList.contains('colors-expanded')) return;
            if (home) home.scrollTop = scrollHome;
            if (window.scrollY !== scrollPagina) window.scrollTo(0, scrollPagina);
        };
        requestAnimationFrame(conservarVista);
    };
    if (selectorColor) selectorColor.onclick = abrirPanelColores;

    const mostrarColoresGenero = async (genero) => {
        if (!contenedorColores) return;
        const normalizarGenero = ({ caballero: 'caballero', dama: 'dama', niño: 'nino', joven: 'joven', bebe: 'bebe' })[String(genero).toLowerCase()] || String(genero).toLowerCase();
        const colores = await obtenerColoresPorGenero(normalizarGenero);
        const coloresIniciales = [...colores];
        for (let indice = coloresIniciales.length - 1; indice > 0; indice--) {
            const aleatorio = Math.floor(Math.random() * (indice + 1));
            [coloresIniciales[indice], coloresIniciales[aleatorio]] = [coloresIniciales[aleatorio], coloresIniciales[indice]];
        }
        const coloresCompactos = new Set(coloresIniciales.slice(0, 3).map(color => color.id));
        contenedorColores.querySelectorAll('.details-color').forEach(boton => boton.remove());
        if (listaBrowser) listaBrowser.replaceChildren();
        colorSeleccionado = null;
        aplicarColorPlayera('#ffffff');
        if (swatchElegido) swatchElegido.style.removeProperty('--shirt-color');
        if (nombreElegido) nombreElegido.textContent = 'Elige color';

        const seleccionarColor = (color) => {
            colorSeleccionado = { name: color.nombre, hex: color.hex, id: color.id };
            if (swatchElegido) swatchElegido.style.setProperty('--shirt-color', color.hex);
            if (nombreElegido) nombreElegido.textContent = color.nombre;
            aplicarColorPlayera(color.hex);
            [...contenedorColores.querySelectorAll('.details-color'), ...(listaBrowser?.querySelectorAll('.details-color') || [])].forEach(b => {
                const elegido = b.dataset.color === color.id;
                b.classList.toggle('active', elegido);
                b.setAttribute('aria-pressed', String(elegido));
            });
        };

        colores.forEach((color) => {
            const boton = document.createElement('button');
            boton.type = 'button';
            boton.className = 'details-color';
            boton.dataset.color = color.id;
            boton.title = color.nombre;
            boton.setAttribute('aria-label', color.nombre);
            boton.setAttribute('aria-pressed', 'false');
            boton.style.setProperty('--shirt-color', color.hex || '#fff');
            boton.hidden = !coloresCompactos.has(color.id);
            boton.addEventListener('click', () => seleccionarColor(color));
            contenedorColores.insertBefore(boton, expandir);

            const opcion = boton.cloneNode(false);
            opcion.classList.add('details-color-option');
            opcion.hidden = false;
            const muestra = document.createElement('span');
            muestra.className = 'details-color-option-swatch';
            muestra.style.setProperty('--shirt-color', color.hex || '#fff');
            muestra.setAttribute('aria-hidden', 'true');
            const etiqueta = document.createElement('span');
            etiqueta.className = 'details-color-option-name';
            etiqueta.textContent = color.nombre;
            opcion.append(muestra, etiqueta);
            opcion.addEventListener('click', () => seleccionarColor(color));
            listaBrowser?.appendChild(opcion);
        });

        const espaciosVacios = Math.max(0, 35 - colores.length);
        for (let indice = 0; indice < espaciosVacios; indice++) {
            const espacio = document.createElement('button');
            espacio.type = 'button';
            espacio.className = 'details-color-option details-color-option-placeholder';
            espacio.disabled = true;
            espacio.setAttribute('aria-disabled', 'true');
            espacio.setAttribute('aria-label', 'Color no disponible para esta categoría');
            espacio.title = 'Color no disponible para esta categoría';
            espacio.setAttribute('aria-hidden', 'true');
            listaBrowser?.appendChild(espacio);
        }

        if (expandir) {
            expandir.hidden = colores.length <= 3;
            expandir.onclick = abrirPanelColores;
        }
    };

    const generoContainer = elemento('detailsGenders');
    generoContainer?.querySelectorAll('.details-gender').forEach(boton => {
        boton.onclick = async () => {
            generoContainer.querySelectorAll('.details-gender').forEach(item => {
                const activo = item === boton;
                item.classList.toggle('active', activo);
                item.setAttribute('aria-pressed', String(activo));
            });
            deslizarPanelColores(false);
            browser?.setAttribute('aria-hidden', 'true');
            expandir?.setAttribute('aria-expanded', 'false');
            seccion.classList.remove('color-selection-mode');
            elemento('detailsAddCart')?.classList.remove('is-saving-color');
            const etiqueta = elemento('detailsAddCartLabel');
            if (etiqueta) etiqueta.textContent = etiquetaAccion;
            renderizarTallas(boton.dataset.gender);
            await mostrarColoresGenero(boton.dataset.gender);
        };
    });
    const generoInicial = generoContainer?.querySelector('.details-gender.active')?.dataset.gender || 'Caballero';
    renderizarTallas(generoInicial);
    await mostrarColoresGenero(generoInicial);

    if (seleccionInicial) {
        const generoDeseado = String(seleccionInicial.gender || seleccionInicial.genero || '').toLocaleLowerCase('es-MX');
        const botonGenero = [...(generoContainer?.querySelectorAll('.details-gender') || [])]
            .find(boton => boton.dataset.gender.toLocaleLowerCase('es-MX') === generoDeseado);
        if (botonGenero && !botonGenero.classList.contains('active')) await botonGenero.onclick();

        const tallaDeseada = String(seleccionInicial.size || '').toUpperCase();
        contenedorTallas?.querySelector(`[data-size="${CSS.escape(tallaDeseada)}"]`)?.click();

        const colorDeseado = String(seleccionInicial.color?.id || seleccionInicial.color?.name || '').toLocaleLowerCase('es-MX');
        const botonColor = [...(contenedorColores?.querySelectorAll('.details-color') || []), ...(listaBrowser?.querySelectorAll('.details-color-option') || [])]
            .find(boton => [boton.dataset.color, boton.title, boton.getAttribute('aria-label')]
                .some(valor => String(valor || '').toLocaleLowerCase('es-MX') === colorDeseado));
        botonColor?.click();
    }

    const quantityValue = elemento('detailsQuantityValue');
    if (quantityValue) quantityValue.textContent = String(Math.max(1, Number(seleccionInicial?.quantity) || 1));
    const quantity = elemento('detailsQuantity');
    if (quantity) {
        elemento('detailsQuantityPlus').onclick = () => { if (quantityValue) quantityValue.textContent = String((Number(quantityValue.textContent) || 1) + 1); };
        elemento('detailsQuantityMinus').onclick = () => { if (quantityValue) quantityValue.textContent = String(Math.max(1, (Number(quantityValue.textContent) || 1) - 1)); };
    }


    /* -----------------------------------------------------
       AGREGAR AL CARRITO
    ----------------------------------------------------- */

    const botonAgregar = elemento('detailsAddCart');

    if (botonAgregar) {

        botonAgregar.onclick = () => {

            if (seccion.classList.contains('color-selection-mode')) {
                if (!colorSeleccionado) {
                    notificarDetalles('Elige un color para guardar tu selección.');
                    return;
                }
                seccion.classList.remove('color-selection-mode');
                deslizarPanelColores(false);
                browser?.setAttribute('aria-hidden', 'true');
                expandir?.setAttribute('aria-expanded', 'false');
                botonAgregar.classList.remove('is-saving-color');
                const etiqueta = elemento('detailsAddCartLabel');
            if (etiqueta) etiqueta.textContent = etiquetaAccion;
                return;
            }

            if (!tallaSeleccionada) {
                notificarDetalles('Elige una talla para continuar.');
                return;
            }

            if (!colorSeleccionado) {
                notificarDetalles('Elige un color para agregar esta prenda.');
                return;
            }

            document.dispatchEvent(
                new CustomEvent('producto:agregar-carrito', {
                    detail: {
                        ...producto,
                        gender: generoContainer?.querySelector('.details-gender.active')?.dataset.gender || 'Caballero',
                        size: tallaSeleccionada,
                        color: colorSeleccionado,
                        quantity: Math.max(1, Number(quantityValue?.textContent) || 1),
                        quoteKey
                    }
                })
            );

        };

    }


    /* -----------------------------------------------------
       MOSTRAR DETALLES
    ----------------------------------------------------- */

    seccion.classList.add('is-open');
    document.getElementById('catalogHome')?.classList.add('details-active');
    actualizarBotonHeaderDetalles(true);

    seccion.setAttribute(
        'aria-hidden',
        'false'
    );

    if (catalogHome) catalogHome.scrollTop = 0;
    catalogHome?.querySelector('.home-topbar')?.classList.remove('scrolled');

}


/* =========================================================
   CERRAR DETALLES
========================================================= */

function cerrarDetallesProducto() {

    const seccion = document.getElementById('homeProductDetails');

    if (!seccion) return;

    resetearSelectorColoresDetalles();

    seccion.classList.remove('is-open');
    const catalogHome = document.getElementById('catalogHome');
    catalogHome?.classList.remove('details-active');
    if (seccion.dataset.restoreCategoryView === 'true') {
        catalogHome?.classList.add('category-view-active');
        delete seccion.dataset.restoreCategoryView;
    }
    actualizarBotonHeaderDetalles(false);

    seccion.setAttribute(
        'aria-hidden',
        'true'
    );

}


function inicializarPanelComercial() {
    const openButton = document.getElementById('headerCartButton');
    const badge = document.querySelector('#headerCartButton .header-cart-badge');
    const drawer = document.getElementById('commercePanelHost');
    const quoteList = document.getElementById('commerceQuoteList');
    const quoteEmpty = document.getElementById('commerceQuoteEmpty');
    const quoteTotal = document.getElementById('commerceQuoteTotal');
    const quoteItemCount = document.getElementById('commerceQuoteItemCount');
    const orderButton = document.getElementById('commerceOrderButton');
    if (!drawer || !openButton || !badge) return;

    const storageRead = key => {
        try { return JSON.parse(localStorage.getItem(key) || '[]'); }
        catch { return []; }
    };
    const storageWrite = (key, value) => {
        try { localStorage.setItem(key, JSON.stringify(value)); }
        catch { /* El panel sigue funcionando durante esta sesión. */ }
    };
    let cotizacion = storageRead('vision-creativa:cotizacion');
    if (!Array.isArray(cotizacion)) cotizacion = [];

    const formatMoney = value => Number(value).toLocaleString('es-MX', {
        style: 'currency', currency: 'MXN', maximumFractionDigits: 2
    });
    const saveQuote = () => storageWrite('vision-creativa:cotizacion', cotizacion);
    const updateCartBadge = (animate = false) => {
        const count = cotizacion.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
        const botones = [...document.querySelectorAll('[data-cart-trigger]')];
        botones.forEach(boton => {
            let contador = boton.querySelector('.header-cart-badge');
            if (!contador) {
                contador = document.createElement('span');
                contador.className = 'header-cart-badge';
                contador.setAttribute('aria-live', 'polite');
                boton.append(contador);
            }
            if (!contador) return;
            contador.textContent = String(count);
            contador.hidden = count === 0;
            if (animate && count > 0) {
                contador.classList.remove('is-pulsing');
                void contador.offsetWidth;
                contador.classList.add('is-pulsing');
                window.setTimeout(() => contador.classList.remove('is-pulsing'), 600);
            }
        });
    };

    const tintShirtPreview = (image, hex) => {
        if (!hex || !/^#[\da-f]{6}$/i.test(hex) || hex.toLowerCase() === '#ffffff') return;
        const source = new Image();
        source.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = source.naturalWidth;
            canvas.height = source.naturalHeight;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) return;
            context.drawImage(source, 0, 0);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
            const tint = hex.match(/[\da-f]{2}/gi).map(part => parseInt(part, 16));
            for (let index = 0; index < pixels.data.length; index += 4) {
                if (!pixels.data[index + 3]) continue;
                if (hex.toLowerCase() === '#000000') {
                    pixels.data[index] = 255 - pixels.data[index];
                    pixels.data[index + 1] = 255 - pixels.data[index + 1];
                    pixels.data[index + 2] = 255 - pixels.data[index + 2];
                } else {
                    pixels.data[index] *= tint[0] / 255;
                    pixels.data[index + 1] *= tint[1] / 255;
                    pixels.data[index + 2] *= tint[2] / 255;
                }
            }
            context.putImageData(pixels, 0, 0);
            image.src = canvas.toDataURL('image/png');
        };
        source.src = image.src;
    };

    const animateCartAdd = () => {
        const button = document.getElementById('detailsAddCart');
        const target = [...document.querySelectorAll('[data-cart-trigger] .header-cart-badge')]
            .find(element => element.getClientRects().length && !element.hidden);
        if (!button || !target) return;
        const from = button.getBoundingClientRect();
        const to = target.getBoundingClientRect();
        const dot = document.createElement('span');
        dot.className = 'commerce-add-flyer';
        dot.style.left = `${from.left + from.width / 2 - 7}px`;
        dot.style.top = `${from.top + from.height / 2 - 7}px`;
        document.body.append(dot);
        const dx = to.left + to.width / 2 - (from.left + from.width / 2);
        const dy = to.top + to.height / 2 - (from.top + from.height / 2);
        dot.animate([
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            { transform: `translate(${dx * .72}px, ${dy * .72}px) scale(.75)`, opacity: 1, offset: .72 },
            { transform: `translate(${dx}px, ${dy}px) scale(.2)`, opacity: 0 }
        ], { duration: 650, easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = () => dot.remove();
    };

    const makeItemImage = item => {
        const frame = document.createElement('button');
        frame.type = 'button';
        frame.className = 'commerce-item-image';
        frame.dataset.quoteAction = 'edit';
        frame.setAttribute('aria-label', `Editar ${item.sku || item.name || 'producto'} de la cotización`);
        const preview = document.createElement('span');
        preview.className = 'commerce-shirt-preview';
        const base = document.createElement('img');
        base.className = 'commerce-shirt-base';
        base.src = item.baseImage || './hero/playeras/playera-frente.png';
        base.alt = '';
        base.loading = 'lazy';
        tintShirtPreview(base, item.color?.hex);
        const print = document.createElement('img');
        print.className = `commerce-shirt-print ${item.printPosition === 'top' ? 'is-top' : 'is-center'} ${item.printView === 'back' ? 'is-back' : ''} ${item.contrast || item.printNeedsContrast ? 'needs-contrast' : ''}`;
        print.src = item.printImage || item.image || '';
        print.alt = '';
        print.loading = 'lazy';
        preview.append(base, print);
        frame.append(preview);
        return frame;
    };

    const asegurarTono = (item, index) => {
        const tonos = ['rosa', 'azul', 'gris'];
        item.cardTone = tonos[index % tonos.length];
        return item.cardTone;
    };

    const renderQuote = () => {
        quoteList?.replaceChildren();
        if (quoteEmpty) quoteEmpty.hidden = cotizacion.length > 0;
        let total = 0;
        let precioPendiente = false;
        let prendas = 0;
        cotizacion.forEach((item, index) => {
            const quantity = Math.max(1, Number(item.quantity) || 1);
            prendas += quantity;
            const price = Number(item.price);
            if (Number.isFinite(price) && price > 0) total += price * quantity;
            else precioPendiente = true;

            const row = document.createElement('article');
            row.className = `commerce-item commerce-quote-item commerce-item--${asegurarTono(item, index)}`;
            row.dataset.quoteKey = item.key;
            row.append(makeItemImage(item));
            const copy = document.createElement('div');
            copy.className = 'commerce-item-copy';
            const title = document.createElement('span');
            title.className = 'commerce-item-title';
            const legacyName = String(item.name || '');
            const legacySku = /^[A-Z]{2,}[\s-]*\d+[A-Z\d-]*$/i.test(legacyName) ? legacyName : '';
            title.textContent = item.sku || item.numero || legacySku || 'SKU no disponible';
            const meta = document.createElement('span');
            meta.className = 'commerce-item-meta';
            const genero = item.gender || item.genero || 'Género por elegir';
            const generoVisible = genero.toLocaleLowerCase('es-MX') === 'joven' ? 'Juvenil' : genero;
            meta.textContent = `${generoVisible} · Talla ${item.size || '—'} · ${item.color?.name || 'Color por elegir'}`;
            const controls = document.createElement('div');
            controls.className = 'commerce-quantity';
            controls.innerHTML = `<button type="button" data-quote-action="increase" aria-label="Aumentar cantidad">+</button><output>${quantity}</output><button type="button" data-quote-action="decrease" aria-label="Reducir cantidad">−</button>`;
            copy.append(title, meta);
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'commerce-item-remove';
            remove.dataset.quoteAction = 'remove';
            remove.setAttribute('aria-label', `Quitar ${item.sku || 'producto'} de la cotización`);
            remove.textContent = '×';
            row.append(copy, controls, remove);
            quoteList?.append(row);
        });
        if (quoteTotal) quoteTotal.textContent = precioPendiente ? 'Precio por confirmar' : formatMoney(total);
        if (quoteItemCount) quoteItemCount.textContent = `${prendas} ${prendas === 1 ? 'prenda' : 'prendas'}`;
        if (orderButton) orderButton.disabled = cotizacion.length === 0;
        saveQuote();
        updateCartBadge();
    };

    const closeDrawer = () => {
        openButton.setAttribute('aria-expanded', 'false');
        cerrarProducto();
        openButton.focus({ preventScroll: true });
    };
    const openDrawer = () => {
        const view = document.querySelector('#productoView');
        if (view?.classList.contains('is-commerce') && view.classList.contains('is-open')) return;
        abrirPanelComercial();
        openButton.setAttribute('aria-expanded', 'true');
        requestAnimationFrame(() => {
            document.querySelector('#productoView [data-producto-close]')?.focus({ preventScroll: true });
        });
    };

    openButton.addEventListener('click', openDrawer);
    document.addEventListener('click', event => {
        const button = event.target.closest('[data-cart-trigger]');
        if (!button) return;
        const view = document.querySelector('#productoView');
        if (view?.classList.contains('is-commerce') && view.classList.contains('is-open')) return;
        openDrawer();
    });
    document.addEventListener('commerce-panel:cerrado', () => {
        openButton.setAttribute('aria-expanded', 'false');
    });
    window.addEventListener('storage', event => {
        if (event.key !== 'vision-creativa:cotizacion') return;
        try {
            const actualizada = JSON.parse(event.newValue || '[]');
            if (!Array.isArray(actualizada)) return;
            cotizacion = actualizada;
            renderQuote();
        } catch { /* Ignora datos externos inválidos y conserva el estado actual. */ }
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && document.querySelector('#productoView.is-commerce.is-open')) closeDrawer();
    });

    quoteList?.addEventListener('click', event => {
        const button = event.target.closest('[data-quote-action]');
        if (!button) return;
        const row = button.closest('[data-quote-key]');
        const index = cotizacion.findIndex(item => item.key === row?.dataset.quoteKey);
        if (index < 0) return;
        const action = button.dataset.quoteAction;
        if (action === 'edit') {
            const seleccionado = cotizacion[index];
            const sku = String(seleccionado.sku || seleccionado.name || '').trim().toUpperCase();
            const resultado = window.catalogo?.categorias?.reduce((encontrado, categoria) => {
                if (encontrado) return encontrado;
                const producto = categoria.productos?.find(item =>
                    [item.sku, item.numero, item.id].some(valor => String(valor || '').trim().toUpperCase() === sku)
                );
                return producto ? { producto, categoria } : null;
            }, null);
            if (!resultado) return;
            document.dispatchEvent(new CustomEvent('producto:personalizar', {
                detail: { ...resultado, seleccionInicial: seleccionado, quoteKey: seleccionado.key }
            }));
            return;
        }
        if (action === 'remove') cotizacion.splice(index, 1);
        else if (action === 'increase') cotizacion[index].quantity++;
        else if (action === 'decrease') {
            cotizacion[index].quantity--;
            if (cotizacion[index].quantity <= 0) cotizacion.splice(index, 1);
        }
        saveQuote();
        renderQuote();
    });

    orderButton?.addEventListener('click', () => {
        if (!cotizacion.length) return;
        const prendasPorGenero = new Map();
        cotizacion.forEach(item => {
            const genero = item.gender || item.genero || 'Por confirmar';
            const generoVisible = genero.toLocaleLowerCase('es-MX') === 'joven' ? 'Juvenil' : genero;
            if (!prendasPorGenero.has(generoVisible)) prendasPorGenero.set(generoVisible, []);
            prendasPorGenero.get(generoVisible).push(item);
        });
        const prendasTexto = [...prendasPorGenero.entries()].map(([genero, prendas]) => [
            `${genero}:`,
            'Cuello redondo algodón MC',
            ...prendas.map(item => `> ${Math.max(1, Number(item.quantity) || 1)}x ${item.sku || item.name || 'Por confirmar'} T-${item.size || 'Por confirmar'} ${item.color?.name || 'Por confirmar'}`)
        ].join('\n')).join('\n\n');
        const totalPrendas = cotizacion.reduce((total, item) => total + Math.max(1, Number(item.quantity) || 1), 0);
        const mensaje = [
            `Hola, Visión Creativa. Quisiera cotizar estas ${totalPrendas} playeras:`,
            '',
            prendasTexto,
            '',
            'Por favor, confirmen la disponibilidad de los colores y el precio.'
        ].join('\n');
        const url = `https://wa.me/523223772971?text=${encodeURIComponent(mensaje)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
        document.dispatchEvent(new CustomEvent('cotizacion:solicitar-pedido', {
            detail: { items: cotizacion.map(item => ({ ...item })), message: mensaje, url }
        }));
    });

    document.addEventListener('producto:agregar-carrito', event => {
        const product = event.detail;
        if (!product?.sku) return;
        const colorId = product.color?.id || product.color?.name || '';
        const genderId = product.gender || product.genero || '';
        const key = `${product.sku}|${genderId}|${product.size}|${colorId}`;
        const quantity = Math.max(1, Number(product.quantity) || 1);
        const editIndex = product.quoteKey
            ? cotizacion.findIndex(item => item.key === product.quoteKey)
            : -1;
        const productData = { ...product };
        delete productData.quoteKey;
        if (editIndex >= 0) {
            const duplicateIndex = cotizacion.findIndex((item, index) => index !== editIndex && item.key === key);
            if (duplicateIndex >= 0) {
                cotizacion[duplicateIndex].quantity += quantity;
                cotizacion.splice(editIndex, 1);
            } else {
                cotizacion[editIndex] = {
                    ...cotizacion[editIndex],
                    ...productData,
                    key,
                    quantity,
                    cardTone: cotizacion[editIndex].cardTone
                };
            }
        } else {
            const existing = cotizacion.find(item => item.key === key);
            if (existing) existing.quantity += quantity;
            else cotizacion.push({ ...productData, key, cardTone:['rosa', 'azul', 'gris'][Math.floor(Math.random() * 3)], quantity });
        }
        saveQuote();
        renderQuote();
        updateCartBadge(true);
        animateCartAdd();
        notificarDetalles(product.quoteKey ? 'Cambios guardados en tu cotización.' : 'Prenda agregada a tu cotización.');
        const addButton = document.getElementById('detailsAddCart');
        const label = document.getElementById('detailsAddCartLabel');
        if (addButton) {
            addButton.classList.remove('is-added');
            void addButton.offsetWidth;
            addButton.classList.add('is-added');
            if (label) label.textContent = 'Agregado a cotización';
            window.setTimeout(() => {
                addButton.classList.remove('is-added');
                if (label) label.textContent = 'Agregar a cotización';
            }, 1400);
        }
    });

    renderQuote();
}


/* =========================================================
   INICIAR APLICACIÓN
========================================================= */

async function iniciarApp() {

    try {

        /* -------------------------------------------------
           CARGAR DATOS
        ------------------------------------------------- */

        const [
            catalogo,
            configuracion
        ] = await Promise.all([
            cargarCatalogo(),
            cargarConfiguracion()
        ]);


        /* -------------------------------------------------
           ESTADO GLOBAL
        ------------------------------------------------- */

        window.catalogo = catalogo;
        window.configuracion = configuracion;
        await activarTemaVisual(configuracion);


        /* -------------------------------------------------
           SUPERFICIE HOME
        ------------------------------------------------- */

        const catalogHome =
            document.querySelector('#catalogHome');

        if (!catalogHome) {
            throw new Error(
                'No se encontró #catalogHome'
            );
        }


        /* -------------------------------------------------
           HEADER
        ------------------------------------------------- */

        const header =
            catalogHome.querySelector('.home-topbar');

        if (!header) {
            throw new Error(
                'No se encontró .home-topbar'
            );
        }


        /* -------------------------------------------------
           HEADER / SCROLL
        ------------------------------------------------- */

        const actualizarHeader = () => {

            if (catalogHome.scrollTop > 10) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }

        };

        catalogHome.addEventListener(
            'scroll',
            actualizarHeader,
            { passive: true }
        );

        actualizarHeader();


        /* -------------------------------------------------
           VISTA UNIVERSAL DE PRODUCTO
        ------------------------------------------------- */

        inicializarProductoView();

        window.abrirProducto = abrirProducto;
        window.cerrarProducto = cerrarProducto;


        /* -------------------------------------------------
           CERRAR DETALLES
        ------------------------------------------------- */

        const botonCerrarDetalles =
            document.getElementById('detailsClose');

        if (botonCerrarDetalles) {

            botonCerrarDetalles.addEventListener(
                'click',
                cerrarDetallesProducto
            );

        }

        inicializarBusqueda(catalogo, configuracion);


        /* -------------------------------------------------
           CONECTAR PERSONALIZAR CON DETALLES
        ------------------------------------------------- */

        document.addEventListener(
            'producto:personalizar',
            (evento) => {

                const {
                    producto,
                    categoria,
                    seleccionInicial,
                    quoteKey
                } = evento.detail || {};

                if (!producto || !categoria) {
                    console.warn(
                        'Faltan datos del producto o la categoría.'
                    );
                    return;
                }


                /* -----------------------------------------
                   IMAGEN PRINCIPAL
                ----------------------------------------- */

                const imagen =
                    producto.imagenes?.find((img) =>
                        img.vista === 'front' &&
                        img.posicion === 'center'
                    ) ||
                    producto.imagenes?.find((img) =>
                        img.vista === 'front'
                    ) ||
                    producto.imagenes?.[0];


                /* -----------------------------------------
                   RUTA DEL ESTAMPADO
                ----------------------------------------- */

                const printImage = imagen
                    ? './diseños/' +
                      encodeURIComponent(categoria.carpeta) +
                      '/' +
                      encodeURIComponent(imagen.archivo)
                    : '';


                /* -----------------------------------------
                   PLAYERA BASE
                ----------------------------------------- */

                const baseImage =
                    imagen?.vista === 'back'
                        ? './hero/playeras/playera-espalda.png'
                        : './hero/playeras/playera-frente.png';


                /* -----------------------------------------
                   ADAPTAR PRODUCTO
                ----------------------------------------- */

                const productoDetalles = {

                    name:
                        producto.sku ||
                        producto.nombre ||
                        producto.titulo ||
                        producto.numero || 'Diseño',

                    sku:
                        producto.sku ||
                        producto.numero ||
                        '',

                    category:
                        categoria.nombre ||
                        categoria.carpeta ||
                        'Colección',

                    description:
                        producto.descripcion || '',

                    price:
                        producto.precio || 0,

                    baseImage,
                    printImage,
                    printPosition: imagen?.posicion === 'top' ? 'top' : 'center',
                    printView: imagen?.vista === 'back' ? 'back' : 'front',
                    printNeedsContrast: producto.necesitaContraste === true ||
                        imagen?.necesitaContraste === true ||
                        imagen?.estampadoClaro === true ||
                        (Array.isArray(configuracion?.home?.recomendaciones?.contrasteBlanco)
                            ? configuracion.home.recomendaciones.contrasteBlanco
                            : []).some(item =>
                            [producto.sku, producto.numero].some(valor =>
                                String(valor || '').trim().toUpperCase() === String(item || '').trim().toUpperCase()
                            )
                        ),

                    galleryImages: (Array.isArray(producto.imagenes) ? producto.imagenes : []).map(imagen => ({
                        ...imagen,
                        url: `./diseños/${encodeURIComponent(categoria.carpeta)}/${encodeURIComponent(imagen.archivo)}`,
                        baseImage: imagen.vista === 'back'
                            ? './hero/playeras/playera-espalda.png'
                            : './hero/playeras/playera-frente.png',
                        necesitaContraste: imagen.necesitaContraste === true || imagen.estampadoClaro === true
                    })),

                    sizes: Array.isArray(producto.tallas)
                        ? producto.tallas
                        : (Array.isArray(producto.sizes) ? producto.sizes : undefined),

                    colors:
                        producto.colores ||
                        [
                            {
                                name: 'Blanco',
                                hex: '#ffffff'
                            },
                            {
                                name: 'Negro',
                                hex: '#171717'
                            },
                            {
                                name: 'Rosa',
                                hex: '#f7b8d7'
                            }
                        ]

                };


                /* -----------------------------------------
                   CAMBIAR DE VISTA
                ----------------------------------------- */

                cerrarProducto();

                abrirDetallesProducto(
                    productoDetalles,
                    seleccionInicial,
                    quoteKey
                );

            }
        );


        /* -------------------------------------------------
           RECOMENDACIONES
        ------------------------------------------------- */

        renderizarRecomendaciones(
            catalogo,
            configuracion
        );


        /* -------------------------------------------------
           COLECCIONES
        ------------------------------------------------- */

        renderizarColecciones(
            catalogo,
            configuracion
        );

        inicializarPanelComercial();


        /* -------------------------------------------------
           ICONOS
        ------------------------------------------------- */

        if (window.lucide) {
            window.lucide.createIcons();
        }


        /* -------------------------------------------------
           DEBUG
        ------------------------------------------------- */

        console.log(
            '✓ Visión Creativa iniciada'
        );

        console.log(
            '✓ Catálogo cargado'
        );

        console.log(
            '✓ Configuración cargada'
        );

        console.log(
            '✓ Categorías:',
            catalogo?.categorias?.length ?? 0
        );

        console.log(
            '✓ Categoría de recomendaciones:',
            configuracion
                ?.home
                ?.recomendaciones
                ?.categoria
        );

        console.log(
            '✓ Tema activo:',
            configuracion
                ?.home
                ?.tema || 'default'
        );

        console.log(
            '✓ Recomendaciones cargadas'
        );

        console.log(
            '✓ Colecciones cargadas'
        );

        console.log(
            '✓ Vista universal de producto lista'
        );

        console.log(
            '✓ Detalles de producto listos'
        );

        console.log(
            '✓ catalog-home:',
            catalogHome
        );

        console.log(
            '✓ header:',
            header
        );


    } catch (error) {

        console.error(
            '✗ Error al iniciar Visión Creativa:',
            error
        );

    }

}


/* =========================================================
   ARRANQUE
========================================================= */

iniciarApp();
