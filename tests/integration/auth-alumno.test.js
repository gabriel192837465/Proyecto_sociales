const request = require('supertest');
const path = require('path');
const { resetTestDB } = require('../helpers/db');

const TMP_DB = path.join(__dirname, '..', '..', 'tmp-test-auth-alumno.db');
process.env.HISTORIA_DB_PATH = TMP_DB;

const server = require('../../src/server');

const EMAIL_VALIDO = 'alumno01@alu.tecnica29de6.edu.ar';
const PASSWORD_VALIDA = 'contraseñaSegura123';

describe('Cuentas de alumno (registro / login)', () => {
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

  describe('POST /api/alumno/registro', () => {
    it('registra una cuenta con correo institucional válido', async () => {
      const res = await request(server)
        .post('/api/alumno/registro')
        .send({ email: EMAIL_VALIDO, password: PASSWORD_VALIDA, nombreUsuario: 'juanp' })
        .expect(201);

      expect(res.body.ok).toBe(true);
      expect(res.body.usuario.nombreUsuario).toBe('juanp');
      expect(res.body.usuario).not.toHaveProperty('email');
      expect(res.body.usuario).not.toHaveProperty('passwordHash');
      expect(res.headers['set-cookie'][0]).toMatch(/historia_quiz_uid=/);
    });

    it('rechaza un correo que no es del dominio institucional', async () => {
      const res = await request(server)
        .post('/api/alumno/registro')
        .send({ email: 'alumno@gmail.com', password: PASSWORD_VALIDA, nombreUsuario: 'juanp' })
        .expect(400);

      expect(res.body.error).toBe('dominio_no_institucional');
    });

    it('rechaza un dominio parecido pero incorrecto', async () => {
      const res = await request(server)
        .post('/api/alumno/registro')
        .send({ email: 'alumno@tecnica29de6.edu.ar', password: PASSWORD_VALIDA, nombreUsuario: 'juanp' })
        .expect(400);

      expect(res.body.error).toBe('dominio_no_institucional');
    });

    it('rechaza contraseñas demasiado cortas', async () => {
      const res = await request(server)
        .post('/api/alumno/registro')
        .send({ email: EMAIL_VALIDO, password: '123', nombreUsuario: 'juanp' })
        .expect(400);

      expect(res.body.error).toBe('password_invalida');
    });

    it('rechaza un correo duplicado', async () => {
      await request(server)
        .post('/api/alumno/registro')
        .send({ email: EMAIL_VALIDO, password: PASSWORD_VALIDA, nombreUsuario: 'juanp' })
        .expect(201);

      const res = await request(server)
        .post('/api/alumno/registro')
        .send({ email: EMAIL_VALIDO, password: PASSWORD_VALIDA, nombreUsuario: 'otronombre' })
        .expect(409);

      expect(res.body.error).toBe('email_duplicado');
    });

    it('rechaza un nombre de usuario duplicado', async () => {
      await request(server)
        .post('/api/alumno/registro')
        .send({ email: EMAIL_VALIDO, password: PASSWORD_VALIDA, nombreUsuario: 'juanp' })
        .expect(201);

      const res = await request(server)
        .post('/api/alumno/registro')
        .send({ email: 'otro@alu.tecnica29de6.edu.ar', password: PASSWORD_VALIDA, nombreUsuario: 'juanp' })
        .expect(409);

      expect(res.body.error).toBe('nombre_usuario_duplicado');
    });

    it('nunca almacena la contraseña en texto plano', async () => {
      await request(server)
        .post('/api/alumno/registro')
        .send({ email: EMAIL_VALIDO, password: PASSWORD_VALIDA, nombreUsuario: 'juanp' })
        .expect(201);

      const db = require('../../src/server/infra/db');
      const usuario = db.buscarUsuarioPorEmail(EMAIL_VALIDO);
      expect(usuario.passwordHash).not.toBe(PASSWORD_VALIDA);
      expect(usuario.passwordHash.startsWith('scrypt:')).toBe(true);
    });
  });

  describe('Administración de cuentas de alumno (sección 21)', () => {
    const ADMIN_TOKEN = 'historia';

    beforeEach(async () => {
      await request(server)
        .post('/api/alumno/registro')
        .send({ email: EMAIL_VALIDO, password: PASSWORD_VALIDA, nombreUsuario: 'juanp' });
      await request(server)
        .post('/api/alumno/registro')
        .send({ email: 'lucia@alu.tecnica29de6.edu.ar', password: PASSWORD_VALIDA, nombreUsuario: 'lucia' });
    });

    it('GET /api/admin/usuarios requiere token admin', async () => {
      await request(server).get('/api/admin/usuarios').expect(401);
    });

    it('GET /api/admin/usuarios lista las cuentas sin exponer passwordHash', async () => {
      const res = await request(server)
        .get('/api/admin/usuarios')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .expect(200);

      expect(res.body.usuarios).toHaveLength(2);
      const nombres = res.body.usuarios.map((u) => u.nombreUsuario).sort();
      expect(nombres).toEqual(['juanp', 'lucia']);
      res.body.usuarios.forEach((u) => {
        expect(u).not.toHaveProperty('passwordHash');
        expect(u).not.toHaveProperty('password_hash');
        expect(u).toHaveProperty('email');
        expect(u).toHaveProperty('activo', true);
      });
    });

    it('GET /api/admin/usuarios?q= busca por nombre de usuario o email', async () => {
      const res = await request(server)
        .get('/api/admin/usuarios?q=luc')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .expect(200);
      expect(res.body.usuarios).toHaveLength(1);
      expect(res.body.usuarios[0].nombreUsuario).toBe('lucia');
    });

    it('POST /api/admin/usuarios/:id/activo desactiva una cuenta', async () => {
      const lista = await request(server).get('/api/admin/usuarios').set('X-Admin-Token', ADMIN_TOKEN);
      const juanp = lista.body.usuarios.find((u) => u.nombreUsuario === 'juanp');

      const res = await request(server)
        .post(`/api/admin/usuarios/${juanp.id}/activo`)
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ activo: false })
        .expect(200);
      expect(res.body.usuario.activo).toBe(false);

      // Una cuenta desactivada no puede loguearse.
      const login = await request(server)
        .post('/api/alumno/login')
        .send({ email: EMAIL_VALIDO, password: PASSWORD_VALIDA })
        .expect(403);
      expect(login.body.error).toBe('cuenta_inactiva');
    });

    it('POST /api/admin/usuarios/:id/activo requiere token admin', async () => {
      const lista = await request(server).get('/api/admin/usuarios').set('X-Admin-Token', ADMIN_TOKEN);
      const juanp = lista.body.usuarios.find((u) => u.nombreUsuario === 'juanp');
      await request(server)
        .post(`/api/admin/usuarios/${juanp.id}/activo`)
        .send({ activo: false })
        .expect(401);
    });

    it('POST /api/admin/usuarios/:id/activo con id inexistente devuelve 404', async () => {
      await request(server)
        .post('/api/admin/usuarios/no-existe/activo')
        .set('X-Admin-Token', ADMIN_TOKEN)
        .send({ activo: false })
        .expect(404);
    });
  });

  describe('POST /api/alumno/login', () => {
    beforeEach(async () => {
      await request(server)
        .post('/api/alumno/registro')
        .send({ email: EMAIL_VALIDO, password: PASSWORD_VALIDA, nombreUsuario: 'juanp' });
    });

    it('permite iniciar sesión con credenciales correctas', async () => {
      const res = await request(server)
        .post('/api/alumno/login')
        .send({ email: EMAIL_VALIDO, password: PASSWORD_VALIDA })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.usuario.nombreUsuario).toBe('juanp');
      expect(res.headers['set-cookie'][0]).toMatch(/historia_quiz_uid=/);
    });

    it('rechaza contraseña incorrecta', async () => {
      const res = await request(server)
        .post('/api/alumno/login')
        .send({ email: EMAIL_VALIDO, password: 'contraseñaIncorrecta' })
        .expect(401);

      expect(res.body.error).toBe('credenciales_invalidas');
    });

    it('rechaza un correo que no existe', async () => {
      const res = await request(server)
        .post('/api/alumno/login')
        .send({ email: 'noexiste@alu.tecnica29de6.edu.ar', password: PASSWORD_VALIDA })
        .expect(401);

      expect(res.body.error).toBe('credenciales_invalidas');
    });
  });

  describe('GET /api/alumno/me', () => {
    it('devuelve el usuario autenticado usando la cookie de sesión', async () => {
      const agent = request.agent(server);
      await agent
        .post('/api/alumno/registro')
        .send({ email: EMAIL_VALIDO, password: PASSWORD_VALIDA, nombreUsuario: 'juanp' })
        .expect(201);

      const res = await agent.get('/api/alumno/me').expect(200);
      expect(res.body.usuario.nombreUsuario).toBe('juanp');
    });

    it('devuelve null sin cookie de sesión', async () => {
      const res = await request(server).get('/api/alumno/me').expect(200);
      expect(res.body.usuario).toBeNull();
    });
  });

  describe('POST /api/alumno/logout', () => {
    it('limpia la cookie de sesión', async () => {
      const agent = request.agent(server);
      await agent
        .post('/api/alumno/registro')
        .send({ email: EMAIL_VALIDO, password: PASSWORD_VALIDA, nombreUsuario: 'juanp' });

      await agent.post('/api/alumno/logout').expect(200);
      const res = await agent.get('/api/alumno/me').expect(200);
      expect(res.body.usuario).toBeNull();
    });
  });
});
