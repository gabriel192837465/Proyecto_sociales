# 🇦🇷 Historia Quiz

Sistema de quiz de historia argentina en tiempo real para el aula. Permite a docentes crear bancos de preguntas y que los alumnos respondan en tiempo real desde sus dispositivos móviles.

## 🚀 Características

- **Panel de Docente**: Control total del juego, selección de bancos de preguntas, timer configurable
- **Panel de Administración**: Gestión completa de bancos de preguntas (crear, editar, eliminar)
- **Interfaz de Alumno**: Optimizada para móviles, con timer visual y feedback inmediato
- **Importación de Preguntas**: Soporte para CSV y JSON
- **Ranking en Tiempo Real**: Ranking por ronda y ranking general acumulado
- **Código QR**: Generación automática para que los alumnos se conecten fácilmente
- **Sistema de Reconexión**: Los alumnos pueden reconectarse si pierden conexión (si el servidor se reinicia, los alumnos deben recargar la pestaña y el docente debe hacer click en "reanudar" para continuar la partida)
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

3. Configurar variables de entorno:
```bash
cp .env.example .env
```

Editar `.env` y cambiar el token de administrador por uno seguro:
```
HISTORIA_ADMIN_TOKEN=tu_contraseña_segura
```

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

1. **Docente**: Ingresa al panel de docente con el token configurado
2. **Docente**: Selecciona un banco de preguntas y configura el tiempo por pregunta
3. **Alumnos**: Escanean el código QR o ingresan la URL mostrada en el panel del docente
4. **Alumnos**: Ingresan su nombre para unirse a la sala de espera
5. **Docente**: Inicia el juego cuando todos los alumnos estén conectados
6. **Juego**: Los alumnos responden las preguntas dentro del tiempo límite
7. **Docente**: Ve los resultados en tiempo real y avanza a la siguiente pregunta
8. **Fin**: Se muestra el ranking final con el detalle de respuestas de cada alumno

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
│   │   ├── server-utils.js         # Utilidades del servidor
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
│   │       └── handlers/           # 9 handlers: 7 delgados + 2 con lógica de negocio (ver docs/architecture.md)
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
├── docs/                           # Documentación extendida
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
- Payload limitado a 512KB tanto en WS como en HTTP
- Nunca compartas el archivo `.env` ni lo incluyas en el repositorio

> **Estado actual de seguridad (junio 2026):** Las medidas arriba son las implementadas. La code review 4R del 2026-06-27 identificó pendientes de hardening para producción real: CSP header (R1-002), WS origin check (R1-004), CORS restrictivo (R1-003), auth secundario para alumnos (R1-001). Ver [`docs/code-reviews/2026-06-27-full-4r.md`](docs/code-reviews/2026-06-27-full-4r.md) y [`docs/deployment-guide.md`](docs/deployment-guide.md) para el detalle.

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

El estado de sesión activo (`fase`, `preguntaIdx`, `jugadores`, etc.) se persiste en la tabla `sesiones` del mismo archivo SQLite. Ya no se utiliza el archivo `estado-juego.json` (migración automática one-shot al actualizar).

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

## 📋 Code Reviews

El proyecto mantiene un historial de code reviews completas en [`docs/code-reviews/`](docs/code-reviews/). La más reciente (2026-06-27) cubrió seguridad, mantenibilidad, correctitud y resiliencia vía fan-out de 4 lenses, y dejó un backlog priorizado en [`docs/plan/plan-pendientes.md`](docs/plan/plan-pendientes.md).
