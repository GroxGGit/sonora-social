# Especificación de requisitos de software

## Plataforma social de descubrimiento musical

| Campo | Valor |
|---|---|
| Versión | 0.2 |
| Estado del documento | Implementación MVP en progreso; pendientes de preparación para producción |
| Idioma | Español |
| Plataforma objetivo | Aplicación web responsiva para escritorio y móvil |
| Backend requerido | Node.js y Express |
| Estado de implementación | MVP funcional implementado y probado; quedan componentes y verificaciones pendientes según la matriz de la sección 10 |

> Este documento define el producto y mantiene su avance. Una capacidad solo se marca como **Desarrollado** cuando existe implementación verificable y sus criterios de aceptación relevantes pasan pruebas. “En desarrollo” indica que hay funcionalidad implementada, pero quedan capacidades, verificaciones o decisiones importantes pendientes. El prototipo no debe considerarse listo para producción.

## 1. Propósito y visión

Crear una red social musical que ayude a las personas a descubrir canciones y conocer a otras con gustos afines. El sistema combinará preferencias declaradas, actividad de escucha y retroalimentación social para ofrecer recomendaciones comprensibles. Un feed permitirá evaluar esas recomendaciones y decidir qué escuchar, guardar, compartir o descartar.

### 1.1 Objetivos del producto

1. Permitir que cada persona describa y refine sus gustos musicales.
2. Facilitar el descubrimiento de canciones y de personas con afinidades musicales.
3. Explicar por qué aparece cada recomendación y aprender de las decisiones del usuario.
4. Habilitar interacciones sociales mediante perfiles, conexiones, publicaciones, comentarios, reacciones y chat.
5. Ofrecer una experiencia coherente y usable en pantallas móviles y de escritorio.

### 1.2 Indicadores a definir

Los siguientes indicadores se deben instrumentar antes de fijar metas de negocio. Sus objetivos numéricos quedan pendientes de validación con las partes interesadas:

- Porcentaje de usuarios nuevos que completan su perfil de gustos.
- Porcentaje de recomendaciones con una interacción explícita (escuchar, guardar, compartir, descartar).
- Retención y uso recurrente del feed.
- Conversaciones iniciadas y tasa de respuesta.
- Tasa de reportes, bloqueos y resultados de moderación.

## 2. Alcance

### 2.1 Incluido

- Registro, inicio y cierre de sesión, perfil y configuración de privacidad.
- Declaración de gustos y señales derivadas de la actividad musical.
- Feed de recomendaciones musicales con explicación y controles de retroalimentación.
- Descubrimiento de personas, conexiones y perfiles.
- Publicaciones sobre música, reacciones y comentarios.
- Chat entre usuarios en tiempo real para el MVP.
- Búsqueda y notificaciones sociales.
- Reporte, bloqueo y herramientas básicas de moderación.
- Interfaz web responsiva para móvil y escritorio.
- API backend basada en Node.js y Express.

### 2.2 Fuera del alcance confirmado

- Aplicaciones nativas para iOS o Android.
- Alojar, copiar o distribuir archivos de audio sin derechos.
- Acuerdos, suscripciones o integración confirmada con un servicio de streaming específico.
- Un modelo de aprendizaje automático avanzado desde la primera versión.
- Videollamadas, transmisiones en vivo, monetización y publicidad.

La reproducción de canciones, las vistas previas y la disponibilidad de metadatos dependen de una decisión posterior sobre catálogos y licencias. La especificación no presupone que exista un proveedor contratado.

## 3. Usuarios y necesidades

| Perfil | Necesidades principales |
|---|---|
| Oyente que busca descubrir | Recibir canciones relevantes, entender por qué se recomiendan y expresar si le interesan. |
| Usuario social | Encontrar personas afines, seguirlas o conectar, publicar contenido y conversar. |
| Usuario nuevo | Crear un perfil útil sin tener historial previo de escucha. |
| Moderador | Revisar reportes, limitar abusos y proteger a la comunidad. |

## 4. Supuestos, dependencias y decisiones abiertas

| ID | Tema | Supuesto o decisión pendiente | Responsable sugerido |
|---|---|---|---|
| D-01 | Catálogo y reproducción | Seleccionar una fuente de metadatos y definir si habrá enlaces, vistas previas o reproducción integrada; validar licencias, límites y atribución. | Producto / legal |
| D-02 | Señales de escucha | Definir qué eventos se registran, por cuánto tiempo y con qué consentimiento. | Producto / privacidad |
| D-03 | Conexiones | MVP implementado con seguimiento y solicitudes que requieren aprobación para perfiles privados. Validar si se necesita relación mutua. | Producto |
| D-04 | Tecnología cliente | MVP implementado con HTML, CSS y JavaScript sin framework ni proceso de build; revisar framework si crecen las necesidades de producto/equipo. | Ingeniería |
| D-05 | Persistencia | MVP usa SQLite local mediante `node:sqlite`. Elegir base de datos administrada, copias, recuperación y almacenamiento para producción. | Ingeniería / operaciones |
| D-06 | Tiempo real | MVP usa Socket.IO con autorización de sesión, persistencia de mensajes y deduplicación idempotente. Validar topología y escalado para producción. | Ingeniería |
| D-07 | Escala | Confirmar usuarios concurrentes, volumen de publicaciones, regiones y presupuesto para fijar SLO definitivos. | Producto / operaciones |
| D-08 | Edad y región | Definir edad mínima, regiones de lanzamiento, requisitos legales y tratamiento de datos aplicable. | Producto / legal |
| D-09 | Moderación | Definir equipo, tiempos de respuesta, política de contenido y proceso de apelación. | Operaciones |
| D-10 | Metas de calidad | Aprobar o sustituir los objetivos provisionales de rendimiento y disponibilidad de la sección 7. | Producto / operaciones |
| D-11 | Publicación | No se proporcionó dominio, cuenta de hosting ni autorización de GitHub. Se prepararon flujos CI, un Blueprint de Render con persistencia y el despliegue autogestionado con Docker/Caddy; falta crear el repositorio remoto, validar el Blueprint y desplegar en una cuenta autorizada. | Producto / operaciones |

## 5. Requisitos funcionales

Prioridades: **MVP** = necesario para el primer lanzamiento; **P1** = siguiente fase; **P2** = evolución. Cada requisito está pendiente mientras no exista evidencia de implementación y pruebas.

| ID | Prioridad | Requisito | Criterio de aceptación |
|---|---|---|---|
| RF-01 | MVP | El sistema permitirá registrar una cuenta, iniciar y cerrar sesión de forma segura. | Una persona puede crear una cuenta con datos válidos, autenticarse, cerrar sesión e invalidar la sesión cerrada; los datos inválidos reciben un error comprensible y no crean una cuenta. |
| RF-02 | MVP | El usuario podrá crear y editar perfil, alias, imagen opcional, biografía y preferencias de privacidad. | Los cambios válidos se guardan y se reflejan al volver al perfil; cada campo privado solo se muestra conforme a la configuración y relación autorizada. |
| RF-03 | MVP | El usuario podrá indicar artistas, géneros, canciones u otros intereses musicales disponibles en el catálogo configurado. | La selección queda asociada al perfil, se puede modificar y se usa como señal inicial de personalización; el flujo funciona para una cuenta sin historial de escucha. |
| RF-04 | MVP | El sistema generará recomendaciones de canciones usando gustos declarados, señales de escucha disponibles e interacciones. | Cada recomendación identifica al menos una razón legible y asociada a una señal utilizada; si falta historial, se genera una alternativa basada en los gustos declarados o se comunica que no hay suficientes datos. |
| RF-05 | MVP | El feed presentará recomendaciones musicales y actividad social pertinente en una interfaz donde el usuario pueda decidir qué explorar. | Cada elemento muestra el contenido disponible, su origen y acciones permitidas; el feed admite estados de carga, vacío y error sin presentarlos como resultados exitosos. |
| RF-06 | MVP | El usuario podrá indicar si una recomendación le gusta, no le interesa, desea guardarla o ya la escuchó, según la disponibilidad del catálogo. | Cada acción confirma su resultado, queda asociada a la recomendación y modifica la señal usada en recomendaciones futuras; las acciones repetidas no duplican la misma señal. |
| RF-07 | MVP | El sistema permitirá buscar y explorar perfiles de personas por afinidad musical. | Los resultados respetan la privacidad, muestran información pública y una explicación de afinidad cuando haya datos suficientes; una búsqueda sin coincidencias presenta un estado vacío. |
| RF-08 | MVP | El usuario podrá seguir a otra persona y dejar de seguirla. | El estado de seguimiento se refleja consistentemente en ambos perfiles y en el feed; no se permiten relaciones duplicadas ni acciones sobre una cuenta bloqueada. |
| RF-09 | MVP | El usuario podrá crear publicaciones de texto asociadas opcionalmente a una canción o artista disponible. | Una publicación válida aparece en el perfil y feed correspondientes; contenido inválido o que excede límites configurados no se publica y recibe una explicación. |
| RF-10 | MVP | El usuario podrá reaccionar y comentar publicaciones, y retirar sus propias reacciones o comentarios cuando corresponda. | Las interacciones se atribuyen al usuario correcto, se actualizan en la publicación y respetan permisos, bloqueo y reglas de moderación. |
| RF-11 | MVP | El usuario podrá enviar y recibir mensajes directos en tiempo real con otra persona autorizada. | Con participantes conectados, un mensaje nuevo aparece sin recargar la página; si el destinatario está desconectado, el mensaje se conserva con estado pendiente y se entrega al reconectarse. Si no puede persistirse, se informa el fallo y no se presenta como enviado. |
| RF-12 | MVP | El chat mostrará el estado de envío y el historial permitido de cada conversación. | El emisor puede distinguir enviado, entregado o fallido; solo participantes autorizados acceden a la conversación y el historial respeta políticas de retención. |
| RF-13 | MVP | El usuario podrá bloquear a otra persona y reportar perfiles, publicaciones o mensajes. | Bloquear impide contacto e interacciones según la política documentada; un reporte genera un registro revisable sin revelar al reportado la identidad del informante, salvo obligación legal. |
| RF-14 | MVP | El usuario podrá controlar la visibilidad de su perfil y la recepción de mensajes. | La configuración se aplica a nuevas consultas, conexiones y mensajes; cambios y restricciones son efectivos en el siguiente acceso a la operación protegida. |
| RF-15 | P1 | El usuario podrá buscar canciones, artistas, publicaciones y personas con filtros. | Los resultados corresponden al tipo de búsqueda seleccionado y respetan disponibilidad del catálogo y privacidad. |
| RF-16 | P1 | El sistema notificará al usuario sobre eventos sociales relevantes. | Las notificaciones se crean para eventos configurados, pueden marcarse como leídas y respetan las preferencias del usuario. |
| RF-17 | P1 | El usuario podrá guardar colecciones o listas de canciones recomendadas. | Una colección se puede crear, editar y consultar conforme a su visibilidad y a los derechos de los elementos incluidos. |
| RF-18 | P2 | El sistema podrá incorporar señales sociales agregadas o modelos de recomendación más sofisticados. | El cambio conserva explicaciones, controles de exclusión y evaluación comparativa contra una línea base antes de activarse. |

## 6. Requisitos no funcionales

Los objetivos numéricos identificados como **provisionales** son una propuesta de partida para revisión, no un compromiso de servicio hasta que se aprueben.

| ID | Categoría | Requisito y verificación |
|---|---|---|
| RNF-01 | Responsividad | La experiencia debe funcionar en anchos de 360 px y superiores, además de escritorio; se verificará que no haya desplazamiento horizontal accidental y que las acciones principales sigan siendo utilizables en vistas móvil y escritorio. Los anchos mínimos y navegadores de soporte deben confirmarse antes del lanzamiento. |
| RNF-02 | Accesibilidad | La interfaz debe apuntar a WCAG 2.2 nivel AA. Se verificará navegación por teclado, foco visible, etiquetas accesibles, contraste y mensajes de estado en las rutas principales; se combinarán herramientas automáticas con revisión manual. |
| RNF-03 | Rendimiento | Objetivo provisional bajo una carga de referencia de 100 usuarios concurrentes: p95 de API ≤ 800 ms para operaciones propias, excluyendo dependencias externas, y contenido inicial del feed ≤ 2.5 s en condiciones de prueba documentadas. Producto e ingeniería deben aprobar la carga y los umbrales. |
| RNF-04 | Disponibilidad | Objetivo provisional de 99.5 % mensual para API y chat, excluyendo mantenimiento anunciado y fallas de terceros. Requiere definir monitorización, ventanas de mantenimiento y método de cálculo antes de considerarse compromiso. |
| RNF-05 | Seguridad | Todas las comunicaciones cliente-servidor deben usar TLS en producción; las contraseñas no se almacenarán en texto plano; sesiones, autorizaciones por recurso, validación de entradas, límites de solicitudes y protección contra abuso deben probarse antes del lanzamiento. |
| RNF-06 | Privacidad | Recopilar solo datos necesarios, explicar el uso de señales musicales, ofrecer controles para desactivar o limitar personalización y definir retención, exportación y eliminación de datos. No activar seguimiento de escucha sin informar al usuario y satisfacer las reglas de consentimiento aplicables. |
| RNF-07 | Integridad y autorización | Las operaciones sociales y de chat deben verificar permisos en el backend, no solo en la interfaz. Las pruebas deben demostrar que una persona no puede leer conversaciones ni modificar contenido de otra sin autorización. |
| RNF-08 | Compatibilidad | Definir una matriz de navegadores y versiones soportados antes del lanzamiento; ejecutar pruebas de regresión en navegadores de escritorio y móviles incluidos en ella. |
| RNF-09 | Observabilidad | Registrar errores y métricas operativas sin incluir contraseñas, tokens ni contenido privado innecesario. Deben existir alertas para fallos de API, mensajería y proveedores externos. |
| RNF-10 | Mantenibilidad | Mantener separación entre API, dominio, persistencia e integración de catálogo; documentar contratos de API y automatizar pruebas unitarias, de integración y de extremo a extremo para flujos críticos. |
| RNF-11 | Resiliencia | El fallo o límite de un servicio musical externo no debe convertir el feed en una respuesta exitosa engañosa; informar el estado, conservar acciones reintentables cuando sea seguro y evitar duplicar mensajes o eventos. |
| RNF-12 | Protección de comunidad | Definir límites de frecuencia, reporte, bloqueo, moderación y retención de mensajes conforme a la política de comunidad aprobada. |

## 7. Arquitectura propuesta

La arquitectura es una propuesta lógica; las decisiones de framework de cliente, base de datos, infraestructura y proveedor musical permanecen abiertas.

1. **Cliente web responsivo:** interfaz para móvil y escritorio; el framework se seleccionará después de acordar necesidades de SEO, equipo y despliegue.
2. **API de aplicación:** servicio Node.js con Express para autenticación, perfiles, gustos, recomendaciones, feed, publicaciones, búsquedas, notificaciones y administración.
3. **Canal de tiempo real:** WebSocket para mensajería y eventos de chat; elegir implementación y estrategia de escalado antes de construir.
4. **Capa de dominio:** módulos separados para identidad, relaciones sociales, contenido, catálogo, recomendaciones, mensajería y moderación.
5. **Persistencia:** base de datos pendiente de selección para usuarios, relaciones, preferencias, eventos, publicaciones y mensajes; definir migraciones, copias de seguridad y retención.
6. **Catálogo e integraciones:** adaptador aislado para que la fuente musical pueda sustituirse; no almacenar ni retransmitir audio salvo autorización explícita.
7. **Recomendaciones:** línea base explicable que combina preferencias explícitas y señales de interacción/escucha con ponderaciones documentadas; presentar procedencia y permitir retroalimentación. La estrategia de ponderación y evaluación debe validarse con usuarios.
8. **Operación:** configuración por entorno, gestión de secretos fuera del código, métricas, registros, alertas, despliegue y procedimiento de recuperación.

### 7.2 Implementación actual del prototipo

- Servidor Express con sesiones en cookie `HttpOnly`, hash de contraseñas con `scrypt`, validación de entradas, límites de solicitudes, política de mismo origen y cabeceras de seguridad.
- Persistencia SQLite local con migraciones iniciales y relaciones para perfiles, mensajes, publicaciones, bloqueos, reportes y actividad.
- Cliente web de HTML/CSS/JavaScript nativo con navegación para feed, descubrimiento, perfil, notificaciones y chat.
- Catálogo ficticio de demostración sin archivos de audio ni conexión a un servicio musical externo.
- La autenticación y operaciones principales tienen pruebas de integración; las metas de disponibilidad, carga, accesibilidad y producción aún no están certificadas.

### 7.1 Principios de diseño

- Privacidad y autorización en el servidor como valores predeterminados.
- API documentada y versionable; evitar exponer identificadores o datos privados innecesarios.
- Recomendaciones explicables, con control del usuario y alternativa para cuentas nuevas.
- Integraciones externas desacopladas y con manejo explícito de límites y errores.
- No confundir estados vacíos, errores de proveedor y resultados válidos.

## 8. Flujos críticos a validar

1. **Primera sesión:** registro → elección de gustos → explicación del uso de datos → feed inicial basado en preferencias.
2. **Decisión musical:** recomendación → explicación de afinidad → abrir enlace o reproducción autorizada → guardar, escuchar o descartar → ajuste de recomendaciones posteriores.
3. **Conexión social:** encontrar perfil → revisar afinidades y privacidad → seguir → interactuar o dejar de seguir.
4. **Publicación:** seleccionar texto y canción/artista opcional → validar derechos y contenido → publicar → recibir comentarios o reacciones.
5. **Conversación:** abrir chat autorizado → enviar mensaje → confirmar estado → recibir respuesta; bloqueo y reporte disponibles.
6. **Seguridad de comunidad:** bloquear o reportar → aplicar restricciones inmediatamente → revisión por moderación → comunicar resolución conforme a la política.

## 9. Roadmap propuesto

| Fase | Resultado | Requisitos principales |
|---|---|---|
| Fase 0: decisiones y validación | Resolver catálogo, privacidad, modelo social, métricas, regiones y arquitectura de despliegue. | D-01 a D-10 |
| MVP: descubrimiento y comunidad | Web responsiva, cuentas, perfiles y gustos, feed explicable, retroalimentación, seguimiento, publicaciones, interacciones, chat en tiempo real, privacidad y controles básicos de abuso. | RF-01 a RF-14; RNF-01 a RNF-12 |
| Fase 1: profundidad social | Búsqueda ampliada, notificaciones, colecciones y mejoras de experiencia basadas en uso medido. | RF-15 a RF-17 |
| Fase 2: personalización avanzada | Evaluar modelos de recomendación más sofisticados con datos suficientes, consentimiento, pruebas de calidad y explicabilidad. | RF-18 |

### 9.1 Condiciones de salida del MVP

- Todos los requisitos MVP pasan sus criterios de aceptación y tienen evidencia vinculada.
- Se han aprobado las decisiones que bloquean catálogo, licencias, privacidad y operación.
- Los flujos críticos se prueban en la matriz de dispositivos y navegadores acordada.
- La revisión de seguridad, accesibilidad y rendimiento no tiene hallazgos bloqueantes.
- Hay políticas publicadas para privacidad, comunidad, retención y respuesta a reportes.

## 10. Matriz de trazabilidad y estado de desarrollo

**Estado global: MVP funcional implementado; no está publicado en Internet y no está listo para producción.** Se añadieron archivos para desplegarlo en infraestructura que el usuario controle, pero no se configuró ni verificó un dominio o servidor. Las pruebas automatizadas cubren flujos de backend y mensajería; no certifican los SLO, accesibilidad WCAG ni requisitos legales.

| Capacidad / necesidad | Requisitos | Prioridad | Estado | Evidencia para cambiar a Desarrollado |
|---|---|---|---|---|
| Cuenta, perfil y gustos | RF-01–RF-03, RF-14 | MVP | Desarrollado | Pruebas de integración de registro, contraseña inválida, perfil privado, preferencias y solicitudes de seguimiento aprobadas. |
| Encontrar música y personas | RF-04, RF-07 | MVP | Desarrollado | Recomendaciones explicables, afinidad musical, catálogo y límites de privacidad implementados; prueba automatizada comprueba razones y señales de personalización. |
| Feed retroalimentativo | RF-05–RF-06 | MVP | Desarrollado | Feed, controles de me gusta/no me interesa/guardar/escuchada y persistencia de retroalimentación implementados; la prueba verifica que la señal cambia la recomendación. |
| Red social y publicaciones | RF-08–RF-10 | MVP | Desarrollado | Seguimiento con solicitudes privadas, publicaciones con música, reacciones, comentarios y permisos cubiertos por pruebas de integración. |
| Chat en tiempo real | RF-11–RF-12 | MVP | Desarrollado | Socket.IO, historial, sesión autorizada, entrega en línea y tras reconexión, estado de entrega e idempotencia cubiertos por pruebas de integración. |
| Seguridad y moderación | RF-13–RF-14, RNF-05–RNF-07, RNF-12 | MVP | En desarrollo | Bloqueo, reporte, perfiles privados, hash de contraseñas, cookie protegida, validación de origen y límites implementados. Falta interfaz/flujo de revisión de moderación y revisión de seguridad independiente. |
| Experiencia móvil y escritorio | RNF-01–RNF-02, RNF-08 | MVP | En desarrollo | Diseño responsivo e inspección visual inicial en escritorio/móvil realizados. Faltan pruebas manuales WCAG 2.2 AA y matriz de navegadores acordada. |
| Búsqueda y notificaciones | RF-15–RF-16 | P1 | Desarrollado | Búsqueda global y notificaciones sociales/leídas implementadas en API e interfaz; pruebas verifican búsqueda musical y lectura de notificaciones. |
| Colecciones | RF-17 | P1 | Desarrollado | Crear colección, agregar y retirar canciones y consultar colecciones implementados; prueba verifica persistencia y propiedad. |
| Recomendación avanzada | RF-18 | P2 | Pendiente | Evaluación comparativa, resultados aprobados, explicación, controles y plan de retroceso documentados. |
| Operación y calidad | RNF-03–RNF-11 | MVP | En desarrollo | Errores explícitos, límites de solicitudes, cabeceras seguras, persistencia e idempotencia implementados; faltan objetivos aprobados y evidencia reproducible de rendimiento, disponibilidad, observabilidad y recuperación. |
| CI y publicación desde GitHub | D-11, RNF-04–RNF-09 | Operación | Pendiente | Workflow de CI y blueprint de Render creados; repositorio remoto no creado porque GitHub solicita iniciar sesión y este entorno no cuenta con GitHub CLI autenticado. Falta conexión/hosting autorizados y prueba externa de disponibilidad. |

### 10.1 Convención de estados

- **Pendiente:** no hay implementación disponible o evidencia suficiente de implementación validada.
- **En desarrollo:** hay funcionalidad implementada, pero quedan criterios, auditorías, decisiones o verificaciones por completar.
- **Desarrollado:** criterios de aceptación aprobados y evidencia vinculada (pruebas, revisión o demostración).
- **Bloqueado:** no puede avanzar hasta resolver una dependencia; registrar motivo y responsable.

Actualizar esta matriz con cada entrega. No cambiar el estado únicamente porque exista código o una interfaz visual.

## 11. Riesgos y mitigaciones

| Riesgo | Consecuencia | Mitigación propuesta |
|---|---|---|
| Acceso a catálogo, metadatos o reproducción no disponible o restringido | Feed limitado o incumplimiento de licencias | Resolver proveedor y derechos antes de comprometer reproducción; mantener adaptador desacoplado y mostrar enlaces solo conforme a sus términos. |
| Poco historial en cuentas nuevas | Recomendaciones irrelevantes | Usar gustos declarados y explicar la falta de señales; permitir corregir intereses fácilmente. |
| Señales sociales sesgadas o manipuladas | Recomendaciones de baja calidad o abuso | Limitar automatización, usar controles y métricas, detectar abuso y probar cambios contra una línea base. |
| Acoso o spam por chat y publicaciones | Daño a usuarios y pérdida de confianza | Bloqueo, reporte, límites de frecuencia, controles de privacidad y proceso de moderación desde el MVP. |
| Recolección excesiva de actividad | Riesgo de privacidad y cumplimiento | Minimizar datos, informar el propósito, permitir controles y definir retención y eliminación. |
| Desconexiones o escalado de chat | Pérdida o duplicación de mensajes | Definir estados de entrega, identificadores idempotentes, pruebas de desconexión y estrategia de escalado antes de producción. |
| Requisitos de rendimiento no acordados | Metas difíciles de medir o costosas | Aprobar carga de referencia y SLO provisionales antes de validar capacidad operativa. |

## 12. Glosario

- **Afinidad musical:** coincidencia estimada entre intereses o señales musicales de personas o contenidos.
- **Feed:** flujo ordenado de recomendaciones y actividad social.
- **Retroalimentación:** acciones del usuario que expresan interés o desinterés y pueden ajustar futuras recomendaciones.
- **Señal de escucha:** evento permitido y definido por producto que representa actividad musical; su registro requiere transparencia y controles de privacidad.
- **Desarrollado:** estado de seguimiento que requiere implementación y aceptación verificadas, no solo trabajo iniciado.
