# 🇦🇷 Historia Quiz

Sistema de quiz de historia argentina en tiempo real para el aula. Permite a docentes crear bancos de preguntas y que los alumnos respondan en tiempo real desde sus dispositivos móviles.

## 🚀 Características

- **Cuentas de alumno**: los alumnos se registran con su correo institucional (`@alu.tecnica29de6.edu.ar`) y una contraseña; el nombre visible en el juego y el ranking es el nombre de usuario de su cuenta
- **Código de partida**: el docente crea una partida y obtiene un código de 6 dígitos (más QR) que los alumnos usan para entrar — el código identifica la PARTIDA, la cuenta identifica al ALUMNO
- **Selección automática de banco por curso**: el docente elige el curso (1°/2°/3°) al crear la partida y el sistema resuelve el banco de preguntas correspondiente (configurable en Administración)
- **Autoavance del juego**: el servidor pasa solo a la siguiente pregunta ~2.5s después de mostrar el resultado — el docente no necesita tocar "Siguiente pregunta" en el flujo normal (los controles manuales siguen disponibles como avanzados)
- **Panel de Docente**: selección de bancos, curso, timer configurable, botón verde "Iniciar" y botón rojo "Terminar/Reiniciar"
- **Panel de Administración**: gestión de bancos, cuentas de alumno y preguntas de tipo multiple choice, verdadero/falso, completar y multimedia
- **Interfaz de Alumno**: optimizada para móviles, con timer visual, feedback inmediato y salida/retorno al inicio desde las pantallas de juego
- **Importación de Preguntas**: soporte para CSV y JSON
- **Ranking en Tiempo Real**: Ranking por ronda y ranking general acumulado
- **Código QR**: Generación automática (con el código de partida embebido) para que los alumnos se conecten fácilmente
- **Sistema de Reconexión**: los alumnos y docentes pueden reconectarse si pierden conexión; el estado de la partida se persiste en SQLite
- **Pausa/Reanudación**: El docente puede pausar el tiempo durante una pregunta

## 📋 Requisitos

- Node.js 20.6+ (usa `node --env-file`)
- Navegador moderno (Chrome, Firefox, Safari, Edge)

## 🔧 Instalación

1. Clonar el repositorio:
```bash
git clone <repository-url>
cd historia-quiz
```

2. Instalar dependencias:
```bash
pnpm install
```

3. Crear un archivo `.env` en la raíz con al menos:
```
HISTORIA_ADMIN_TOKEN=tu_contraseña_segura
HISTORIA_COOKIE_SECRET=un_secreto_largo_y_aleatorio
```

También podés definir `PORT` (por defecto `3000`), `HISTORIA_DB_PATH`, `TRUST_PROXY`, `ALLOWED_ORIGINS` e `INTERFACE` según el entorno. No publiques `.env`.

## 🎮 Uso

### Iniciar el servidor

```bash
pnpm start
```

El servidor iniciará en el puerto 3000 (configurable via `PORT` en `.env`).

### Acceder a las interfaces

- **Panel de Administración**: http://localhost:3000/admin.html
- **Panel del Docente**: http://localhost:3000/docente.html
- **Interfaz de Alumno**: http://localhost:3000/alumno.html

### Flujo de trabajo típico

**Alumno** (una sola vez, la sesión persiste):
1. Entra a `/alumno.html`, crea una cuenta con su correo institucional (`@alu.tecnica29de6.edu.ar`) y una contraseña, o inicia sesión si ya tiene cuenta
2. Ingresa el código de partida de 6 dígitos que le dio el docente
3. Entra a la sala de espera — ya no vuelve a escribir su nombre en usos posteriores

**Docente**:
1. Ingresa al panel de docente con el token configurado
2. Selecciona un curso (resuelve el banco automáticamente, si está configurado) o un banco de preguntas manualmente, y el tiempo por pregunta
3. Hace clic en "Crear partida" → obtiene el código de 6 dígitos y el QR (ya incluye el código)
4. Los alumnos escanean el QR o ingresan el código en `/alumno.html`
5. Inicia el juego cuando todos los alumnos estén conectados
6. **Juego**: los alumnos responden dentro del tiempo límite; después de cada resultado el servidor avanza solo a la siguiente pregunta (no hace falta tocar "Siguiente pregunta")
7. El docente puede terminar o reiniciar la ronda con **Terminar/Reiniciar**; para comenzar una nueva ronda utiliza **Iniciar**
8. **Fin**: se muestra el ranking final con el detalle de respuestas de cada alumno

### Cuentas de alumno y administración

- El dominio institucional (`@alu.tecnica29de6.edu.ar`) se valida en el backend, no sólo en el frontend
- Las contraseñas se guardan hasheadas (`scrypt`), nunca en texto plano
- Desde **Administración → 👤 Cuentas de alumno** se pueden listar, buscar y activar/desactivar cuentas
- El mapeo curso → banco se configura vía `GET/POST/DELETE /api/curso-banco` (requiere token admin)

## 🧪 Testing

El proyecto incluye tests unitarios, de integración (Jest) y E2E (Playwright).

### Ejecutar tests

```bash
pnpm test              # Tests unitarios y de integración (Jest)
pnpm run test:watch    # Modo watch
pnpm run test:coverage # Con reporte de cobertura
pnpm run test:e2e      # Tests E2E con Playwright (headless)
pnpm run test:e2e:headed # Tests E2E con navegador visible
```

### Estructura de tests

- `tests/unit/`: Tests de funciones individuales (utils, game logic, frontend, middleware)
- `tests/integration/`: Tests de integración de la API REST y WebSocket
- `tests/e2e/`: Tests E2E con Playwright (admin CRUD, flujo de juego, redirect)
- `tests/load/`: Tests de carga (50 alumnos concurrentes, 3 preguntas)

## 📁 Estructura del proyecto

```
historia-quiz/
├── src/
│   ├── server/                     # ⚙️ Código que corre en Node.js
│   │   ├── index.js                # Entry point
│   │   ├── app.js                  # Factory (createApp)
│   │   ├── config.js               # Configuración (env vars)
│   │   ├── domain/                 # 🧠 Lógica pura (sin I/O ni red)
│   │   │   ├── game.js             # Estado, ranking, historial
│   │   │   └── constants.js        # FASES, TIEMPO_DEFAULT, etc.
│   │   ├── application/            # 🎯 Casos de uso
│   │   │   ├── game-session.js     # Timer, broadcast, mostrarResultado
│   │   │   ├── app-state.js        # DI, resetForTests
│   │   │   └── use-cases/          # iniciar-juego, registrar-respuesta, etc.
│   │   ├── infra/                  # 💾 I/O, persistencia
│   │   │   ├── db.js               # SQLite persistence (bancos, preguntas, sesiones)
│   │   │   ├── security.js         # safeEq timing-safe compare
│   │   │   ├── logger.js           # pino structured logging
│   │   │   └── utils.js            # getLocalIP
│   │   ├── http/                   # 🌐 Adaptador REST
│   │   │   ├── router.js           # Monta rutas y delega
│   │   │   ├── static.js           # Sirve public/ y src/client/ como /js/
│   │   │   ├── controllers/        # Lógica de cada endpoint
│   │   │   └── middleware/         # cors, parse-body, rate-limit, security-headers
│   │   └── ws/                     # 🔌 Adaptador WebSocket
│   │       ├── dispatcher.js       # tipo → handler, conexión/desconexión
│   │       └── handlers/           # Handlers de mensajes WebSocket
│   └── client/                     # 🖥️ Código que corre en el browser
│       ├── entrypoints/            # admin.entry, docente.entry, alumno.entry
│       ├── shared/                 # constants, dom, storage, api-client, socket-client
│       └── features/               # admin/, docente/, alumno/ (cada uno con index, state, api/socket, views)
├── public/                         # 📦 Assets servidos tal cual
│   ├── admin.html, docente.html, alumno.html, index.html
│   └── css/                        # Hojas de estilo (admin.css, docente.css, alumno.css, shared/)
├── tests/                          # Tests
│   ├── unit/                       # Tests unitarios
│   ├── integration/                # Tests de integración
│   ├── e2e/                        # Tests E2E con Playwright
│   ├── helpers/                    # Helpers para tests
│   └── load/                       # Tests de carga
├── scripts/                        # Scripts auxiliares (stop-port.js)
├── package.json                    # packageManager: pnpm@11.5.0
├── pnpm-lock.yaml
├── jest.config.js
├── playwright.config.js
├── babel.config.js                 # Transpila ES modules para Jest
├── .env / .env.example
└── README.md
```

## Arquitectura por capas

### Capa de dominio (`src/server/domain/`)
Funciones puras sin efectos secundarios. Dado estado + acción, devuelve nuevo estado. Cero I/O, cero red, cero setTimeout.

### Capa de aplicación (`src/server/application/`)
Orquesta casos de uso. Usa funciones del dominio y llama a infraestructura. Tiene efectos secundarios controlados (timer, broadcast).

### Capa de infraestructura (`src/server/infra/`)
Detalles técnicos de I/O: filesystem, crypto, red. Las funciones de negocio no viven aquí.

### Adaptadores (`src/server/http/`, `src/server/ws/`)
HTTP y WebSocket son dos adaptadores distintos sobre el mismo dominio. No se llaman entre sí. Ambos leen/escriben sobre la capa de aplicación.

### Frontend (`src/client/`)
ES modules organizados por feature. Cada vista (admin, docente, alumno) es autocontenida con state, api/socket, views e index.

## 🔐 Seguridad

- El token de administrador se configura vía variable de entorno `HISTORIA_ADMIN_TOKEN`
- WebSocket docente auth compara contra el token
- REST API usa header `X-Admin-Token`
- Las cuentas de alumno usan cookies de sesión firmadas (HMAC, mismo mecanismo que la cookie anónima de jugador) — ver `HISTORIA_COOKIE_SECRET` más abajo
- Las contraseñas de alumno se guardan hasheadas con `scrypt` (nunca en texto plano)
- El dominio institucional (`@alu.tecnica29de6.edu.ar`) se valida en el servidor, no sólo en el cliente
- Payload limitado a 512KB tanto en WS como en HTTP
- Nunca compartas el archivo `.env` ni lo incluyas en el repositorio

> Para producción, definí siempre `HISTORIA_COOKIE_SECRET` estable y un `HISTORIA_ADMIN_TOKEN` seguro. Revisá también `ALLOWED_ORIGINS` para limitar los orígenes permitidos.

## 💾 Persistencia y Backup

Los datos de la aplicación se almacenan en una base de datos SQLite (WAL mode) ubicada en `data/historia-quiz.db` por defecto.

### Archivos que deben respaldarse juntos

Debido al modo WAL, SQLite genera tres archivos que deben ser copiados como un conjunto consistente:

| Archivo | Propósito |
|---------|-----------|
| `historia-quiz.db` | Base de datos principal |
| `historia-quiz.db-wal` | Write-Ahead Log (datos no checkpointeados) |
| `historia-quiz.db-shm` | Shared memory (bloqueo de lectores concurrentes) |

> ⚠️ **Importante**: Copiar solo el `.db` sin el `.db-wal` puede resultar en una base de datos incompleta. Usa siempre el modo `VACUUM` o `checkpoint` antes de respaldar, o copia los tres archivos juntos. Para backups seguros en caliente, ejecuta `PRAGMA wal_checkpoint(TRUNCATE)` y luego copia los tres archivos.

### Sesión de juego

El estado de sesión activo (`fase`, `preguntaIdx`, `jugadores`, `codigoPartida`, `cursoSeleccionado`, `bancoIdSeleccionado`, etc.) se persiste en la tabla `sesiones` del mismo archivo SQLite. Ya no se utiliza el archivo `estado-juego.json` (migración automática one-shot al actualizar).

### Cuentas de alumno

Las cuentas se guardan en la tabla `usuarios` (`id`, `email`, `password_hash`, `nombre_usuario`, `rol`, `creado_en`, `activo`) del mismo archivo SQLite — se migra automáticamente si la base ya existía. El mapeo curso→banco se guarda en la tabla genérica `meta` (clave `curso_banco_map`).

### Variable de entorno

- `HISTORIA_DB_PATH`: Ruta personalizada al archivo `.db`. Por defecto `data/historia-quiz.db`.

## 🛠️ Desarrollo

### Scripts disponibles

```bash
pnpm start              # Iniciar el servidor
pnpm stop               # Detener el servidor (libera el puerto)
pnpm restart            # Reiniciar el servidor
pnpm test               # Tests unitarios y de integración
pnpm run test:watch     # Tests en modo watch
pnpm run test:coverage  # Tests con cobertura
pnpm run test:e2e       # Tests E2E (Playwright)
pnpm run test:e2e:headed # Tests E2E con navegador visible
pnpm run test:load        # Tests de carga WebSocket
```

## 📝 Formato de importación de preguntas

### CSV

El CSV debe tener columnas separadas por punto y coma (;):
```
pregunta;opcionA;opcionB;opcionC;opcionD;correcta;epoca
¿En qué año fue la Revolución de Mayo?;1810;1816;1806;1820;A;Independencia
```

### JSON

```json
{
  "preguntas": [
    {
      "pregunta": "¿En qué año fue la Revolución de Mayo?",
      "opciones": ["1810", "1816", "1806", "1820"],
      "correcta": 0,
      "epoca": "Independencia"
    }
  ]
}
```

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -m 'Agrega nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto es de uso educativo.

## 🙋 Soporte

Para reportar issues o sugerencias, por favor abre un issue en el repositorio.

