# Cuenta y acceso a PLUG

El panel usa Better Auth con email y contraseña y sesiones guardadas en el PostgreSQL existente. La creación pública de usuarios está deshabilitada. Las tablas `plug_user`, `plug_account`, `plug_session`, `plug_verification`, `plug_rate_limit` y `plug_access_attempts` se crean de forma aditiva en el primer acceso, bajo un bloqueo de PostgreSQL para evitar migraciones simultáneas. No se modifican las tablas comerciales.

## Primera cuenta

1. Abrí el panel: te lleva a `/ingresar` y muestra **Creá tu cuenta** cuando todavía no hay usuarios.
2. Indicá tu nombre, email y una contraseña nueva de 12 a 128 caracteres, repetida para evitar errores.
3. Ingresá la clave de administración que ya usabas. Se valida en el servidor y solo autoriza crear la primera cuenta. Elegí una contraseña personal diferente.
4. Elegí si querés mantener la sesión iniciada. Al terminar volvés a la pantalla desde la que entraste.

La creación inicial se serializa con un bloqueo no bloqueante de PostgreSQL. Los intentos concurrentes o posteriores no pueden crear una segunda cuenta. Si la cuenta se creó pero el ingreso falló, recargá `/ingresar` e iniciá sesión con el email elegido.

## Sesiones y configuración

- **Mantener sesión iniciada** conserva una cookie HttpOnly por 30 días. En HTTPS también es Secure; usa SameSite=Lax y está disponible para todo el panel. La sesión se renueva al usarlo, como máximo una vez por día.
- Si desactivás esa opción, la cookie no persiste al cerrar la sesión del navegador. Algunos navegadores restauran sus cookies al restaurar pestañas: en equipos compartidos, usá **Cerrar sesión** al terminar.
- **Configuración → Tu cuenta** permite cerrar el acceso actual, cerrar las sesiones de los otros dispositivos y cambiar la contraseña. El cambio cierra las otras sesiones.
- La validación consulta la base; no hay caché de autenticación que mantenga válido un acceso revocado. Las cookies antiguas `store_session` y `reporting_session` dejaron de autorizar accesos.
- Las páginas privadas y cada API privada verifican la sesión. La integración con `BUSINESS_READ_API_KEY` conserva únicamente sus endpoints de lectura; no habilita operaciones del panel.
- Los endpoints públicos de widgets y videos de la tienda, sus assets y el callback de OAuth siguen disponibles. El callback conserva la validación de estado y cookie de OAuth.
- Los intentos de ingreso y alta tienen límites persistidos en PostgreSQL, además de los controles de la biblioteca. Las operaciones con efectos requieren el origen configurado.

## Variables del servidor

Se conserva `ADMIN_PASSWORD`: **no la borres ni la cambies como parte de esta migración**. Sigue cifrando las conexiones guardadas de Tiendanube. La contraseña personal se guarda como hash con sal a través de la biblioteca y cambiarla no afecta la tienda.

`BETTER_AUTH_SECRET` es opcional en instalaciones existentes y debe tener al menos 32 caracteres si se configura. Si falta, se deriva una clave exclusiva para sesiones a partir del secreto interno existente mediante HMAC y un contexto propio. No usa la contraseña personal. Cambiar ese secreto invalida las cookies firmadas existentes; planificar esa rotación por separado.

`BUSINESS_APP_ORIGIN` debe coincidir exactamente con el origen público del panel (por ejemplo `https://db.vidaeventofiesta.site`). Para desarrollo usá `http://localhost:3001`. Evitá alternar dominios o puertos durante un ingreso. PostgreSQL requiere permisos para crear las tablas e índices de autenticación. Si la base no está disponible, el acceso falla cerrado y se puede reintentar.

## Recuperación sin correo

Esta versión no envía correos de recuperación ni usa Gmail. Si olvidás la contraseña, una persona con acceso al servidor y su configuración privada puede ejecutar desde el checkout con dependencias instaladas:

```sh
npm run account:recover
```

El comando carga `.env.local`, solicita email y contraseña por terminal sin mostrar la contraseña, actualiza su hash y revoca todas las sesiones de esa cuenta en una transacción. No pases contraseñas en argumentos ni las guardes en documentación. No existe un endpoint web de recuperación con la clave antigua.

## Crecimiento

Los usuarios, cuentas y sesiones tienen identificadores individuales y el usuario tiene un rol validado en el servidor. Esta primera versión solo admite el rol `admin` y permite crear una única cuenta desde la web. Para sumar colaboradores habrá que implementar invitaciones y definir permisos de operador o lectura. Varios usuarios del mismo negocio no requieren duplicar inventario. Atender otros negocios sí requiere separar sus datos y conexiones; esa separación no está implementada.

## Validación

```sh
npm run test:auth
npx tsx --test tests/*.test.ts
npm run build
```

La prueba de autenticación levanta un PostgreSQL temporal en loopback con credenciales ficticias y un directorio del sistema temporal; no carga `.env.local` ni consulta la base comercial. Verifica alta única, contraseñas hasheadas, cookies, origen, renovación, expiración, revocación, cambio de contraseña, recuperación y separación entre sesión y clave de lectura.
