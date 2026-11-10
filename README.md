# Sonora

Prototipo web responsivo para descubrir música, compartir publicaciones y conversar con personas de gustos afines. El backend usa Node.js y Express; la interfaz se sirve desde el mismo origen y no necesita un proceso de compilación.

## Requisitos

- Node.js 22.5 o superior (incluye el módulo SQLite `node:sqlite`).
- npm.

## Ejecutar localmente

```powershell
npm.cmd install
npm.cmd start
```

Abre <http://localhost:3000> y crea una cuenta. Para desarrollo con reinicio automático:

```powershell
npm.cmd run dev
```

La base SQLite se crea en `data/sonora.sqlite` y permanece local; `data/` está excluida del control de versiones. Para elegir otra ubicación, establece `MUSIC_DB_PATH` antes de iniciar el servidor. El puerto se puede cambiar con `PORT`.

## Verificación

```powershell
npm.cmd test
npm.cmd run check
```

Las pruebas usan una base temporal aislada y validan autenticación, privacidad, recomendaciones, interacciones sociales, colecciones, mensajes en tiempo real y entrega de mensajes después de una desconexión.

## Publicar en un servidor propio

Se incluyen `Dockerfile`, `compose.yaml` y Caddy para publicar con HTTPS automático en un servidor que controles. No se ha desplegado públicamente: este espacio no tiene dominio, servidor ni credenciales de una infraestructura autorizada. Docker no está instalado en este entorno, por lo que estos archivos todavía se deben validar en el servidor antes del primer despliegue.

1. Prepara un servidor Linux propio con Docker Compose y un dominio bajo tu control.
2. Configura los registros DNS del dominio para que apunten a la IP pública del servidor y permite tráfico entrante TCP 80/443 (y UDP 443 para HTTP/3).
3. En el directorio del proyecto, copia `.env.example` a `.env` y sustituye `DOMAIN` por tu dominio real:

   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

4. Desde el servidor, ejecuta:

   ```sh
   docker compose up --build -d
   docker compose logs -f
   ```

5. Abre `https://<tu-dominio>`. Caddy emitirá y renovará el certificado TLS. La base de datos queda en el volumen persistente `sonora-data`.

Para detener los contenedores sin borrar la base de datos, usa `docker compose down` (no agregues `-v`). Conserva copias de seguridad de ese volumen.

Para compartir solo dentro de una red local, inicia `npm start` en el equipo servidor y comparte su dirección de red local con el puerto `3000`. No expongas ese modo HTTP a Internet.

**Antes de admitir usuarios públicos:** el prototipo no incluye una consola/procedimiento completo para revisar reportes, ni ha pasado auditorías legales, de accesibilidad, carga, recuperación y seguridad independientes. Resuelve los pendientes de [ESPECIFICACION.md](./ESPECIFICACION.md), configura copias de seguridad y revisa las políticas antes de usarlo con usuarios reales.

## Publicar desde GitHub en Render

GitHub guarda el código y ejecuta verificaciones; no hospeda por sí solo el backend Express ni la base de datos. El archivo [`render.yaml`](./render.yaml) prepara el servicio web, el chequeo de salud, HTTPS administrado por Render y un disco persistente para SQLite. El servicio `starter` y su disco persistente pueden generar cargos según las tarifas vigentes de Render.

1. Crea un repositorio **privado** nuevo en GitHub con el nombre `sonora-social` (no agregues README, licencia ni `.gitignore`; ya existen localmente). La cuenta debe tener autorización para crear repositorios.
2. Desde esta carpeta, publica la rama principal:

   ```powershell
   git remote add origin https://github.com/<tu-usuario>/sonora-social.git
   git push -u origin main
   ```

3. En Render, crea un **Blueprint** y conecta ese repositorio. Revisa `render.yaml` y confirma el plan con disco persistente antes de desplegar.
4. Cuando el DNS de Render esté listo, abre el dominio `*.onrender.com` que se muestra en el panel. Los cambios en `main` ejecutan CI y actualizan el servicio automáticamente.

La app no necesita secretos de terceros para el MVP; no añadas claves ni contraseñas al repositorio. Render conserva la base en el disco persistente, pero configura copias de seguridad y verifica la recuperación antes de invitar a usuarios reales. No actives el lanzamiento público hasta resolver los pendientes de moderación, privacidad y revisión descritos en [ESPECIFICACION.md](./ESPECIFICACION.md).

## Alcance del prototipo

- Funcional: cuentas y perfiles, gustos, feed con recomendaciones explicables y retroalimentación, perfiles públicos/privados, seguimiento y solicitudes, publicaciones, comentarios, reacciones, bloqueo/reporte, notificaciones, búsqueda, colecciones y chat persistente en tiempo real.
- Pendiente: proveedor de catálogo/reproducción y licencias musicales, interfaz y flujo de revisión de moderación, auditoría de accesibilidad y compatibilidad, métricas/SLO de producción y despliegue con TLS.
- El catálogo incluido es demostrativo: contiene metadatos de muestra, no audio, y no está conectado a servicios de streaming.

Consulta [ESPECIFICACION.md](./ESPECIFICACION.md) para requisitos, criterios de aceptación y estado detallado por capacidad.
