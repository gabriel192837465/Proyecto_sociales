const request = require('supertest');
const path = require('path');
const { resetTestDB } = require('../helpers/db');

const TMP_DB = path.join(__dirname, '..', '..', 'tmp-test-api.db');
process.env.HISTORIA_DB_PATH = TMP_DB;

const server = require('../../src/server');

describe('API REST Integration Tests', () => {
  const ADMIN_TOKEN = 'historia';

  beforeAll((done) => {
    server.resetForTests();
    server.listen(0, '127.0.0.1', done);
  });

  beforeEach(() => {
    resetTestDB(TMP_DB);
  });

  afterEach(() => {
    server.resetForTests();
  });

  afterAll((done) => {
    server.closeAllConnections();
    server.close(() => {
      resetTestDB(TMP_DB);
      delete process.env.HISTORIA_DB_PATH;
      done();
    });
  });

  describe('GET /api/bancos', () => {
    it('debería retornar 401 sin token de autenticación', async () => {
      const response = await request(server)
        .get('/api/bancos')
        .expect(401);
      
      expect(response.body.error).toBe('No autorizado');
    });

    it('debería retornar lista de bancos con token válido', async () => {
      const response = await request(server)
        .get('/api/bancos')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .expect(200);
      
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('nombre');
    });
  });

  describe('POST /api/bancos', () => {
    it('debería crear un nuevo banco de preguntas', async () => {
      const nuevoBanco = {
        nombre: 'Banco de prueba',
        nivel: 'Secundario',
        anio: '3°',
        tema: 'Prueba'
      };

      const response = await request(server)
        .post('/api/bancos')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send(nuevoBanco)
        .expect(201);
      
      expect(response.body.nombre).toBe('Banco de prueba');
      expect(response.body.id).toMatch(/^banco_/);
    });

    it('debería rechazar banco sin nombre', async () => {
      const response = await request(server)
        .post('/api/bancos')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ nivel: 'Secundario' })
        .expect(400);
      
      expect(response.body.error).toBe('El nombre del banco es obligatorio');
    });
  });

  describe('POST /api/bancos/:id/preguntas', () => {
    it('debería agregar una pregunta válida', async () => {
      const pregunta = {
        pregunta: '¿Pregunta de prueba?',
        opciones: ['Opción A', 'Opción B', 'Opción C', 'Opción D'],
        correcta: 0,
        epoca: 'Prueba'
      };

      const response = await request(server)
        .post('/api/bancos/banco_1/preguntas')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send(pregunta)
        .expect(201);
      
      expect(response.body.pregunta).toBe('¿Pregunta de prueba?');
    });

    it('debería guardar tipos, materia y multimedia', async () => {
      const response = await request(server)
        .post('/api/bancos/banco_1/preguntas')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({
          pregunta: '¿Qué representa esta imagen?',
          opciones: ['A', 'B', 'C', 'D'],
          correcta: 1,
          materia: 'Astronomía',
          tipo: 'media',
          mediaTipo: 'image',
          mediaUrl: 'https://example.com/imagen.jpg'
        })
        .expect(201);

      expect(response.body).toMatchObject({ tipo: 'media', materia: 'Astronomía', mediaTipo: 'image' });
    });

    it('debería aceptar verdadero o falso con dos opciones', async () => {
      const response = await request(server)
        .post('/api/bancos/banco_1/preguntas')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ pregunta: '¿La Tierra es plana?', opciones: ['Verdadero', 'Falso'], correcta: 1, tipo: 'true_false', materia: 'Geografía' })
        .expect(201);

      expect(response.body.opciones).toEqual(['Verdadero', 'Falso']);
    });

    it('debería rechazar una pregunta multimedia sin recurso', async () => {
      await request(server)
        .post('/api/bancos/banco_1/preguntas')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ pregunta: 'Pregunta con audio', opciones: ['A', 'B', 'C', 'D'], correcta: 0, tipo: 'media', mediaTipo: 'audio' })
        .expect(400);
    });

    it('debería rechazar opciones inválidas', async () => {
      const pregunta = {
        pregunta: '¿Pregunta?',
        opciones: ['A', 'B'], // Solo 2 opciones, necesita 4
        correcta: 0
      };

      const response = await request(server)
        .post('/api/bancos/banco_1/preguntas')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send(pregunta)
        .expect(400);
      
      expect(response.body.error).toBe('Las opciones deben ser un arreglo de 4 elementos');
    });

    it('debería rechazar pregunta sin texto', async () => {
      const pregunta = {
        pregunta: '',
        opciones: ['A', 'B', 'C', 'D'],
        correcta: 0
      };

      const response = await request(server)
        .post('/api/bancos/banco_1/preguntas')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send(pregunta)
        .expect(400);
      
      expect(response.body.error).toBe('La pregunta es obligatoria');
    });

    it('debería rechazar opciones vacías', async () => {
      const pregunta = {
        pregunta: '¿Pregunta?',
        opciones: ['A', '', 'C', 'D'],
        correcta: 0
      };

      const response = await request(server)
        .post('/api/bancos/banco_1/preguntas')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send(pregunta)
        .expect(400);
      
      expect(response.body.error).toBe('Todas las opciones deben tener texto');
    });

    it('debería rechazar índice correcta inválido', async () => {
      const pregunta = {
        pregunta: '¿Pregunta?',
        opciones: ['A', 'B', 'C', 'D'],
        correcta: 5
      };

      const response = await request(server)
        .post('/api/bancos/banco_1/preguntas')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send(pregunta)
        .expect(400);
      
      expect(response.body.error).toBe('La respuesta correcta debe ser un entero entre 0 y 3');
    });
  });

  describe('GET /api/bancos/:id', () => {
    it('debería retornar un banco específico', async () => {
      const response = await request(server)
        .get('/api/bancos/banco_1')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .expect(200);
      
      expect(response.body.id).toBe('banco_1');
      expect(response.body.nombre).toBeTruthy();
    });

    it('debería retornar 404 para banco inexistente', async () => {
      const response = await request(server)
        .get('/api/bancos/banco_inexistente')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .expect(404);
      
      expect(response.body.error).toBe('No encontrado');
    });
  });

  describe('PUT /api/bancos/:id', () => {
    it('debería actualizar un banco existente', async () => {
      const response = await request(server)
        .put('/api/bancos/banco_1')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({
          nombre: 'Banco actualizado',
          nivel: 'Primario',
          anio: '5°',
          tema: 'Nuevo tema'
        })
        .expect(200);
      
      expect(response.body.nombre).toBe('Banco actualizado');
      expect(response.body.nivel).toBe('Primario');
    });

    it('debería rechazar actualización sin nombre', async () => {
      const response = await request(server)
        .put('/api/bancos/banco_1')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ nivel: 'Primario' })
        .expect(400);
      
      expect(response.body.error).toBe('El nombre del banco es obligatorio');
    });

    it('debería retornar 404 para banco inexistente', async () => {
      const response = await request(server)
        .put('/api/bancos/banco_inexistente')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ nombre: 'Nuevo nombre' })
        .expect(404);
      
      expect(response.body.error).toBe('No encontrado');
    });
  });

  describe('DELETE /api/bancos/:id', () => {
    it('debería eliminar un banco existente', async () => {
      // First create a banco to delete
      const createResponse = await request(server)
        .post('/api/bancos')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ nombre: 'Banco para eliminar', nivel: 'Secundario', anio: '3°', tema: 'Test' });

      const bancoId = createResponse.body.id;

      const response = await request(server)
        .delete(`/api/bancos/${bancoId}`)
        .set('X-Admin-Token', ADMIN_TOKEN)
        .expect(200);

      expect(response.body.ok).toBe(true);
    });

    // R3-004: DELETE banco referenced by active partida must return 409.
    // The partida must remain intact and the banco row must NOT be removed.
    it('R3-004: debería devolver 409 al eliminar banco referenciado por partida activa', async () => {
      // banco_1 viene del seed (5 preguntas). Simulamos que hay una partida
      // en curso cuyas preguntasActivas son las preguntas de banco_1.
      const app = server.app;
      const banco = app.state.db.bancos.find((b) => b.id === 'banco_1');
      expect(banco).toBeDefined();
      expect(banco.preguntas.length).toBeGreaterThan(0);

      app.state.estado.fase = 'pregunta';
      app.state.estado.preguntasActivas = banco.preguntas.map((p) => ({ ...p }));

      const response = await request(server)
        .delete('/api/bancos/banco_1')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .expect(409);

      expect(response.body.error).toBe('banco_en_uso');

      // R3-004: pregunta_count = bancoPregIds.size (count of questions
      // referenced by the active partida from this banco). En este test
      // preguntasActivas incluye todas las preguntas de banco_1, así que
      // bancoPregIds.size === banco.preguntas.length.
      expect(response.body).toHaveProperty('pregunta_count');
      expect(response.body.pregunta_count).toBe(banco.preguntas.length);

      // El banco NO debe haberse eliminado
      const stillThere = app.state.db.bancos.find((b) => b.id === 'banco_1');
      expect(stillThere).toBeDefined();
      expect(stillThere.preguntas.length).toBeGreaterThan(0);

      // La partida debe seguir intacta
      expect(app.state.estado.preguntasActivas.length).toBe(banco.preguntas.length);
    });

    // R3-004: DELETE unused banco in lobby (no active partida referencing it) succeeds.
    it('R3-004: debería permitir eliminar banco no usado con partida en lobby', async () => {
      const app = server.app;
      // Creamos un banco nuevo sin uso
      const createResponse = await request(server)
        .post('/api/bancos')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ nombre: 'Banco sin uso', nivel: 'Secundario', anio: '3°', tema: 'Test' });

      const bancoId = createResponse.body.id;

      // Forzamos la fase a lobby (estado por defecto, pero lo explicitamos)
      app.state.estado.fase = 'lobby';
      app.state.estado.preguntasActivas = [];

      const response = await request(server)
        .delete(`/api/bancos/${bancoId}`)
        .set('X-Admin-Token', ADMIN_TOKEN)
        .expect(200);

      expect(response.body.ok).toBe(true);

      // Verificar que el banco ya no existe
      const stillThere = app.state.db.bancos.find((b) => b.id === bancoId);
      expect(stillThere).toBeUndefined();
    });
  });

  describe('PUT /api/bancos/:id/preguntas/:preguntaId', () => {
    it('debería actualizar una pregunta existente', async () => {
      // First add a question to update
      const addResponse = await request(server)
        .post('/api/bancos/banco_1/preguntas')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({
          pregunta: '¿Pregunta para actualizar?',
          opciones: ['A', 'B', 'C', 'D'],
          correcta: 0
        });
      
      const preguntaId = addResponse.body.id;

      const response = await request(server)
        .put(`/api/bancos/banco_1/preguntas/${preguntaId}`)
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({
          pregunta: '¿Pregunta actualizada?',
          opciones: ['A', 'B', 'C', 'D'],
          correcta: 1,
          epoca: 'Nueva época'
        })
        .expect(200);
      
      expect(response.body.pregunta).toBe('¿Pregunta actualizada?');
      expect(response.body.correcta).toBe(1);
    });

    it('debería rechazar actualización de pregunta inexistente', async () => {
      const response = await request(server)
        .put('/api/bancos/banco_1/preguntas/p_inexistente')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({
          pregunta: '¿Pregunta?',
          opciones: ['A', 'B', 'C', 'D'],
          correcta: 0
        })
        .expect(404);
      
      expect(response.body.error).toBe('Pregunta no encontrada');
    });

    it('debería rechazar actualización en banco inexistente', async () => {
      const response = await request(server)
        .put('/api/bancos/banco_inexistente/preguntas/p1')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({
          pregunta: '¿Pregunta?',
          opciones: ['A', 'B', 'C', 'D'],
          correcta: 0
        })
        .expect(404);
      
      expect(response.body.error).toBe('No encontrado');
    });
  });

  describe('DELETE /api/bancos/:id/preguntas/:preguntaId', () => {
    it('debería eliminar una pregunta existente', async () => {
      // First add a question to delete
      const addResponse = await request(server)
        .post('/api/bancos/banco_1/preguntas')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({
          pregunta: '¿Pregunta para eliminar?',
          opciones: ['A', 'B', 'C', 'D'],
          correcta: 0
        });
      
      const preguntaId = addResponse.body.id;

      const response = await request(server)
        .delete(`/api/bancos/banco_1/preguntas/${preguntaId}`)
        .set('X-Admin-Token', ADMIN_TOKEN)
        .expect(200);
      
      expect(response.body.ok).toBe(true);
    });

    it('debería manejar eliminación en banco inexistente', async () => {
      const response = await request(server)
        .delete('/api/bancos/banco_inexistente/preguntas/p1')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .expect(404);
      
      expect(response.body.error).toBe('No encontrado');
    });

    it('debería generar IDs únicos después de eliminar una pregunta', async () => {
      const r1 = await request(server)
        .post('/api/bancos/banco_1/preguntas')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({
          pregunta: '¿Pregunta temporal?',
          opciones: ['A', 'B', 'C', 'D'],
          correcta: 0
        })
        .expect(201);
      const id1 = r1.body.id;

      // Delete the question
      await request(server)
        .delete(`/api/bancos/banco_1/preguntas/${id1}`)
        .set('X-Admin-Token', ADMIN_TOKEN)
        .expect(200);

      // Create another
      const r2 = await request(server)
        .post('/api/bancos/banco_1/preguntas')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({
          pregunta: '¿Otra pregunta?',
          opciones: ['A', 'B', 'C', 'D'],
          correcta: 1
        })
        .expect(201);
      const id2 = r2.body.id;

      // IDs must be different even after deletion
      expect(id1).not.toBe(id2);
    });
  });

  describe('POST /api/bancos/:id/importar-csv', () => {
    it('debería importar preguntas desde CSV válido', async () => {
      const csv = `pregunta;opA;opB;opC;opD;correcta;epoca
"¿Pregunta 1?";"A";"B";"C";"D";"A";"Independencia"
"¿Pregunta 2?";"A";"B";"C";"D";"B";"Siglo XX"`;

      const response = await request(server)
        .post('/api/bancos/banco_1/importar-csv')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ csv })
        .expect(200);
      
      expect(response.body.importadas).toBe(2);
    });

    it('debería retornar 404 para banco inexistente', async () => {
      const response = await request(server)
        .post('/api/bancos/banco_inexistente/importar-csv')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ csv: 'test' })
        .expect(404);
      
      expect(response.body.error).toBe('No encontrado');
    });

    it('debería manejar CSV vacío', async () => {
      const response = await request(server)
        .post('/api/bancos/banco_1/importar-csv')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ csv: '' })
        .expect(200);
      
      expect(response.body.importadas).toBe(0);
    });
  });

  describe('POST /api/bancos/:id/importar-json', () => {
    it('debería importar preguntas desde JSON válido', async () => {
      const preguntas = [
        {
          pregunta: '¿Pregunta 1?',
          opciones: ['A', 'B', 'C', 'D'],
          correcta: 0,
          epoca: 'Independencia'
        },
        {
          pregunta: '¿Pregunta 2?',
          opciones: ['A', 'B', 'C', 'D'],
          correcta: 1,
          epoca: 'Siglo XX'
        }
      ];

      const response = await request(server)
        .post('/api/bancos/banco_1/importar-json')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ preguntas })
        .expect(200);
      
      expect(response.body.importadas).toBe(2);
    });

    it('debería rechazar JSON sin arreglo de preguntas', async () => {
      const response = await request(server)
        .post('/api/bancos/banco_1/importar-json')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ preguntas: 'no es arreglo' })
        .expect(400);
      
      expect(response.body.error).toBe('Se esperaba un objeto con un arreglo de preguntas');
    });

    it('debería rechazar preguntas inválidas', async () => {
      const preguntas = [
        {
          pregunta: '',
          opciones: ['A', 'B', 'C', 'D'],
          correcta: 0
        }
      ];

      const response = await request(server)
        .post('/api/bancos/banco_1/importar-json')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ preguntas })
        .expect(400);
      
      expect(response.body.error).toBe('La pregunta es obligatoria');
    });

    it('debería rechazar opciones inválidas', async () => {
      const preguntas = [
        {
          pregunta: '¿Pregunta?',
          opciones: ['A', 'B'],
          correcta: 0
        }
      ];

      const response = await request(server)
        .post('/api/bancos/banco_1/importar-json')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ preguntas })
        .expect(400);
      
      expect(response.body.error).toBe('Las opciones deben ser un arreglo de 4 elementos');
    });

    it('debería rechazar respuestas correctas fuera de rango', async () => {
      const preguntas = [
        {
          pregunta: '¿Pregunta?',
          opciones: ['A', 'B', 'C', 'D'],
          correcta: 5
        }
      ];

      const response = await request(server)
        .post('/api/bancos/banco_1/importar-json')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ preguntas })
        .expect(400);
      
      expect(response.body.error).toBe('La respuesta correcta debe ser un entero entre 0 y 3');
    });

    it('debería retornar 404 para banco inexistente', async () => {
      const response = await request(server)
        .post('/api/bancos/banco_inexistente/importar-json')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ preguntas: [] })
        .expect(404);
      
      expect(response.body.error).toBe('No encontrado');
    });
  });

  describe('POST /api/bancos/:id/importar-csv — edge cases', () => {
    it('debería omitir filas con columnas incorrectas', async () => {
      const csv = `pregunta;opA;opB;opC;opD;correcta;epoca
"P1";"A";"B";"C";"D";"A";"X"
"P2";"A";"B";"C"`;
      const res = await request(server)
        .post('/api/bancos/banco_1/importar-csv')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ csv })
        .expect(200);
      expect(res.body.importadas).toBe(1);
      expect(res.body.omitidas).toBe(1);
    });

    it('debería omitir filas con opciones vacías', async () => {
      const csv = `pregunta;opA;opB;opC;opD;correcta;epoca
;A;B;C;D;A;General`;
      const res = await request(server)
        .post('/api/bancos/banco_1/importar-csv')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ csv })
        .expect(200);
      expect(res.body.importadas).toBe(0);
    });

    it('debería omitir filas con letra correcta inválida', async () => {
      const csv = `pregunta;opA;opB;opC;opD;correcta;epoca
"Preg";"A";"B";"C";"D";"E";"General"`;
      const res = await request(server)
        .post('/api/bancos/banco_1/importar-csv')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ csv })
        .expect(200);
      expect(res.body.importadas).toBe(0);
      expect(res.body.omitidas).toBe(1);
    });

    // R3-005: parser hand-rolled falla en "" escapes, ; dentro de comillas,
    // y celdas multi-línea. Reemplazar por csv-parse (sync) para cubrir
    // los 3 casos sin pérdida de filas.
    it('R3-005: debería importar las 50 filas del fixture con "" escapes, ; en comillas y multi-línea', async () => {
      const fs = require('fs');
      const path = require('path');
      const csv = fs.readFileSync(
        path.join(__dirname, '..', 'fixtures', '50row.csv'),
        'utf8'
      );
      const res = await request(server)
        .post('/api/bancos/banco_1/importar-csv')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ csv })
        .expect(200);

      // El parser hand-rolled actual pierde 4 filas (multi-línea y comillas
      // mal cerradas). csv-parse debería importar las 50 sin omitir ninguna.
      expect(res.body.omitidas).toBe(0);
      expect(res.body.importadas).toBe(50);

      // Verificar que la fila 1 (con "" escapes) preservó las comillas literales.
      const banco = server.app.state.db.bancos.find((b) => b.id === 'banco_1');
      const fila1 = banco.preguntas.find((q) => q.pregunta.includes('Padre de la Patria'));
      expect(fila1).toBeDefined();
      expect(fila1.pregunta).toBe('¿Quién fue conocido como el "Padre de la Patria"?');

      // Verificar que la fila 5 (con ; dentro de comillas) preservó los ; literales.
      const fila5 = banco.preguntas.find((q) => q.pregunta.includes('25;5;1810'));
      expect(fila5).toBeDefined();
      expect(fila5.pregunta).toBe('¿Qué batalla ocurrió el 25;5;1810?');

      // Verificar que la fila 13 (celda multi-línea) preservó los \n literales.
      const fila13 = banco.preguntas.find((q) => q.pregunta.includes('consecuencia'));
      expect(fila13).toBeDefined();
      expect(fila13.pregunta.replace(/\r\n/g, '\n')).toBe('¿Cuál fue la consecuencia\nprincipal de la Revolución\nde Mayo?');
    });
  });

  describe('API — rutas no encontradas', () => {
    it('debería retornar 404 para ruta API desconocida', async () => {
      const res = await request(server)
        .get('/api/ruta-inventada')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .expect(404);
      expect(res.body.error).toBe('Ruta no encontrada');
    });
  });

  describe('API — payload demasiado grande', () => {
    it('debería rechazar payload que excede 512KB', async () => {
      const large = { nombre: 'x'.repeat(600 * 1024) };
      try {
        const res = await request(server)
          .post('/api/bancos')
          .set('X-Admin-Token', ADMIN_TOKEN)
          .send(large);
        // Si la respuesta llega antes del destroy, debe ser 413
        expect(res.status).toBe(413);
        expect(res.body.error).toBe('El cuerpo de la solicitud excede el límite de 512 KB');
      } catch (err) {
        // req.destroy() puede cerrar la conexión antes de responder
        expect(err.message).toMatch(/ECONNRESET|socket hang up/);
      }
    });
  });

  describe('API — validación de cuerpo inválido', () => {
    it('debería rechazar POST a banco con cuerpo no objeto', async () => {
      const res = await request(server)
        .post('/api/bancos')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send('texto-literal')
        .expect(400);
      expect(res.body.error).toBe('Cuerpo inválido');
    });
  });

  describe('OPTIONS /api/bancos', () => {
    it('debería responder 204 a OPTIONS', async () => {
      await request(server)
        .options('/api/bancos')
        .expect(204);
    });
  });

  describe('CORS security headers with admin token (R1-003)', () => {
    const ALLOWED_ORIGIN = 'https://aula.example';
    let originalEnv;

    beforeAll(() => {
      originalEnv = process.env.CORS_ALLOWED_ORIGINS;
      process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN;
    });

    afterAll(() => {
      if (originalEnv === undefined) {
        delete process.env.CORS_ALLOWED_ORIGINS;
      } else {
        process.env.CORS_ALLOWED_ORIGINS = originalEnv;
      }
    });

    it('debería retornar el origen eco en ACAO si el origen está en el allowlist y tiene token admin', async () => {
      const res = await request(server)
        .get('/api/health')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .set('Origin', ALLOWED_ORIGIN)
        .expect(200);

      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    });

    it('debería omitir la cabecera ACAO si el origen no está en el allowlist y tiene token admin', async () => {
      const res = await request(server)
        .get('/api/health')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .set('Origin', 'https://evil.example')
        .expect(200);

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('debería omitir ACAO si no hay token admin en la solicitud', async () => {
      const res = await request(server)
        .get('/api/health')
        .set('Origin', 'https://evil.example')
        .expect(200);

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('Mapeo curso → banco (sección 13)', () => {
    it('debería retornar 401 sin token de autenticación', async () => {
      await request(server).get('/api/curso-banco').expect(401);
    });

    it('debería devolver un mapa vacío si no se configuró nada', async () => {
      const res = await request(server)
        .get('/api/curso-banco')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .expect(200);
      expect(res.body.mapa).toEqual({});
    });

    it('debería asociar un curso a un banco existente', async () => {
      const bancos = await request(server).get('/api/bancos').set('X-Admin-Token', ADMIN_TOKEN);
      const bancoId = bancos.body[0].id;

      const res = await request(server)
        .post('/api/curso-banco')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ curso: '1°', bancoId })
        .expect(200);

      expect(res.body.mapa['1°']).toBe(bancoId);

      const relectura = await request(server)
        .get('/api/curso-banco')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .expect(200);
      expect(relectura.body.mapa['1°']).toBe(bancoId);
    });

    it('debería rechazar un bancoId que no existe', async () => {
      const res = await request(server)
        .post('/api/curso-banco')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ curso: '1°', bancoId: 'banco_inexistente' })
        .expect(404);
      expect(res.body.error).toBe('No existe un banco con ese id');
    });

    it('debería exigir curso y bancoId', async () => {
      await request(server)
        .post('/api/curso-banco')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ bancoId: 'banco_1' })
        .expect(400);

      await request(server)
        .post('/api/curso-banco')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ curso: '1°' })
        .expect(400);
    });

    it('debería permitir quitar una asociación', async () => {
      const bancos = await request(server).get('/api/bancos').set('X-Admin-Token', ADMIN_TOKEN);
      const bancoId = bancos.body[0].id;
      await request(server)
        .post('/api/curso-banco')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ curso: '2°', bancoId });

      const res = await request(server)
        .delete('/api/curso-banco')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ curso: '2°' })
        .expect(200);
      expect(res.body.mapa['2°']).toBeUndefined();
    });
  });
});
