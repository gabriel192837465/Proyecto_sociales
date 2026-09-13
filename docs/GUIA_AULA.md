# Trivia ET29 en el aula

Guia operativa para usar la aplicacion sin Internet, con datos moviles o con una red Wi-Fi local aislada.

## 1. Como funciona la red

Trivia ET29 se ejecuta en la computadora del docente. Esa computadora funciona como servidor y los celulares solo necesitan llegar a su direccion IP local. No hace falta Internet, una cuenta en la nube ni acceso a la red del colegio.

Todos los dispositivos deben estar en la misma red:

- Computadora del docente + hotspot del docente.
- Computadora del docente + router Wi-Fi propio.
- Computadora del docente + una red Wi-Fi local que permita que los dispositivos se vean entre si.

La aplicacion usa HTTP para las pantallas y WebSocket para el juego en tiempo real. Por eso no alcanza con que cada equipo tenga Internet: deben compartir la misma red local.

## 2. Preparacion previa

En la computadora del docente:

1. Instalar Node.js 20.6 o superior y pnpm 11.
2. Abrir PowerShell en la carpeta del proyecto.
3. Instalar dependencias:

   ```powershell
   pnpm install
   ```

4. Crear `.env` a partir de `.env.example`.
5. Cambiar `HISTORIA_ADMIN_TOKEN` por una clave que solo conozca el equipo docente.
6. Generar y guardar un `HISTORIA_COOKIE_SECRET` estable. No cambiarlo durante una jornada si se necesita reconexionar alumnos.
7. Verificar que los bancos de preguntas esten cargados desde el panel de Administracion.

No compartir el archivo `.env` ni mostrar su contenido en pantalla.

## 3. Opcion A: datos moviles mediante hotspot

Esta opcion es util cuando la red del colegio esta restringida.

1. Activar el punto de acceso movil del celular del docente o de un router 4G/5G.
2. Conectar la computadora del docente a ese hotspot.
3. Conectar los celulares de los alumnos al mismo hotspot.
4. Desactivar VPN, Tailscale y redes virtuales en la computadora si el servidor muestra una IP incorrecta.
5. Iniciar la aplicacion:

   ```powershell
   pnpm start
   ```

6. El servidor mostrara dos direcciones. El docente debe abrir la direccion `localhost`; los alumnos deben usar la direccion que dice `Los ALUMNOS entran`.
7. Probar desde un celular antes de comenzar: abrir `http://IP_DEL_DOCENTE:3000/alumno.html`.
8. Mantener el hotspot activo durante toda la partida. Si el celular que comparte la red se bloquea o pierde señal, la red local puede interrumpirse.

El consumo de datos es bajo porque las preguntas, respuestas y estados viajan dentro de la red local. El acceso a Internet movil solo se usa para crear el hotspot, no para transportar la partida.

## 4. Opcion B: Wi-Fi local sin Internet

Se puede usar un router propio sin conectar su salida a Internet.

1. Encender el router y anotar el nombre y la clave de la red.
2. Conectar la computadora del docente y todos los celulares a esa red.
3. Comprobar que el router no tenga activada la opcion `AP isolation`, `Client isolation` o `Aislamiento de clientes`. Esa opcion impide que los celulares lleguen a la computadora.
4. Iniciar la aplicacion con `pnpm start`.
5. Usar la IP privada que el servidor informa en consola, por ejemplo `192.168.1.25`.
6. Compartir con los alumnos:

   ```text
   http://192.168.1.25:3000/alumno.html
   ```

   Tambien se puede mostrar el QR del panel docente.

No es necesario configurar DNS, HTTPS, port forwarding ni abrir puertos en Internet. Solo debe permitirse el puerto 3000 dentro de la red local.

## 5. Firewall de Windows

En el primer arranque, Windows puede preguntar si Node.js puede comunicarse en redes privadas. Elegir **Permitir acceso** para redes privadas.

Si los celulares no abren la pagina:

1. En Windows, abrir `Firewall de Windows Defender`.
2. Crear o habilitar una regla de entrada TCP para el puerto `3000` en redes privadas.
3. No abrir el puerto para redes publicas ni publicar el servidor en Internet.
4. Volver a probar desde un celular conectado a la misma red.

## 6. Flujo de una clase

### Docente

1. Abrir `http://localhost:3000/docente.html`.
2. Ingresar la clave configurada en `HISTORIA_ADMIN_TOKEN`.
3. Elegir el curso o el banco de preguntas.
4. Elegir el tiempo por pregunta.
5. Presionar **Crear partida**.
6. Mostrar el QR o compartir el codigo de seis digitos.
7. Esperar a que aparezcan todos los alumnos en la sala.
8. Presionar **Iniciar**.
9. Durante la partida se puede pausar, terminar el tiempo o avanzar manualmente desde controles avanzados.
10. Al finalizar, revisar el ranking, exportar el informe CSV o imprimirlo.
11. Para otra ronda con el mismo grupo, volver al menu y crear/iniciar una nueva partida.

### Alumno

1. Conectarse a la misma red del docente.
2. Abrir el QR o `http://IP_DEL_DOCENTE:3000/alumno.html`.
3. Crear una cuenta institucional o iniciar sesion.
4. Ingresar el codigo de seis digitos.
5. Esperar en la sala y responder cada pregunta antes de que termine el tiempo.
6. Si se corta la conexion, volver a la misma direccion. La reconexion conserva la identidad cuando la cookie del navegador sigue disponible.

## 7. Prueba de cinco minutos antes de la clase

- Abrir la URL desde un celular alumno.
- Crear una partida de prueba.
- Conectar dos celulares y verificar que aparecen en la sala.
- Iniciar una pregunta y responder desde ambos.
- Pausar y reanudar.
- Finalizar y comprobar el informe.
- Cerrar la partida de prueba o volver al lobby.

## 8. Diagnostico rapido

| Problema | Accion |
| --- | --- |
| `localhost` funciona en la PC pero no en celulares | Usar la IP que muestra `Los ALUMNOS entran`, nunca `localhost`. |
| No aparece una IP privada | Conectar la PC a la misma red del hotspot/router y reiniciar el servidor. |
| La IP mostrada pertenece a VPN o adaptador virtual | Desactivar la VPN o arrancar con `INTERFACE=nombre_de_interfaz`. |
| La pagina abre pero el juego no actualiza | Revisar firewall y que el router no aisle clientes. |
| El puerto 3000 esta ocupado | Ejecutar `pnpm stop` y luego `pnpm start`. |
| Se reinicio la computadora durante una partida | Iniciar con el mismo `.env`, especialmente el mismo `HISTORIA_COOKIE_SECRET`; luego decidir si se reanuda el snapshot. |
| Un alumno queda duplicado despues de un reinicio | Mantener el mismo secreto de cookie y pedirle volver a cargar la pagina. |
| El QR no funciona | Escribir manualmente `http://IP_DEL_DOCENTE:3000/alumno.html` y comprobar que ambos equipos estan en la misma red. |

## 9. Seguridad y cierre

- Usar una clave de docente distinta de `historia`.
- No publicar el puerto 3000 en Internet.
- No usar la red publica del colegio si no se puede garantizar el aislamiento entre clientes.
- Al terminar, detener el servidor con `Ctrl+C` o `pnpm stop`.
- Respaldar `data/historia-quiz.db`, `data/historia-quiz.db-wal` y `data/historia-quiz.db-shm` juntos cuando exista una base con cuentas o resultados.
