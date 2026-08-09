# Solicitud de autorización de assets

Dos emails listos para enviar. **No se han enviado** — revísalos y mándalos tú.

Objetivo: obtener autorización escrita para usar fotografía e identidad de la propiedad en una demo privada. Sin ese sí por escrito, el prototipo sigue con fotografía sustituta y `noindex/nofollow`.

Consejo de secuencia: manda primero el de NVOGA. Villa Casia ya tiene film público en YouTube, así que el listón de autorización es más bajo y una respuesta afirmativa te sirve de referencia cuando escribas a Christie's.

---

## 1 · Christie's International Real Estate Madrid

**Para:** info@christiesrealestate-madrid.com
**Tel. (seguimiento):** +34 910 970 970
**Dirección:** Calle Núñez de Balboa 12, Madrid
**Asunto:** M1558 — solicitud de autorización de material para una demo privada

> Buenos días,
>
> Me llamo Jennifer y dirijo Larum Studio. Trabajamos el reposicionamiento de valor percibido en inmobiliaria premium: no hacemos fotografía ni edición, construimos la experiencia digital a través de la cual se percibe una propiedad antes de visitarla.
>
> Hemos desarrollado un prototipo funcional tomando M1558 como referencia de trabajo. Es una experiencia por propiedad —narrativa por momentos del día, lógica espacial, concierge privado que responde sobre la residencia y sobre Goya, y solicitud de conversación privada— pensada para un comprador que decide antes de pisar el inmueble.
>
> Escribo por una cuestión de forma. El prototipo está construido con fotografía sustituta con licencia, no con material de Christie's, y no es público: lleva `noindex` y no se distribuye. Antes de enseñarlo con la identidad y las imágenes reales de M1558, necesito su autorización por escrito.
>
> Lo que pediría, si les encaja:
>
> - autorización de uso de fotografía de M1558 en una demo privada, no indexada y no distribuible;
> - confirmación de los datos que mostramos como verificados (superficies, orientación, año, certificación energética, gastos de comunidad e IBI);
> - si existe, plano y brochure en PDF.
>
> A cambio les paso el acceso a la experiencia completa de M1558, sin coste ni compromiso. Si les resulta útil para la venta, hablamos. Si no, se retira el material y no queda nada publicado.
>
> ¿Les viene bien una llamada de quince minutos esta semana o la próxima?
>
> Un saludo,
> Jennifer — Larum Studio
> contacto@larumstudio.com

---

## 2 · NVOGA — Marbella

**Para:** info@nvoga.com
**Tel. (seguimiento):** +34 952 813 333
**Dirección:** Avda. Duque de Ahumada 2, Edif. Marbell Center, 29602 Marbella
**Asunto:** Villa Casia — solicitud de autorización de material para una demo privada

> Buenos días,
>
> Me llamo Jennifer y dirijo Larum Studio. Trabajamos el reposicionamiento de valor percibido en inmobiliaria premium: no hacemos fotografía ni edición, construimos la experiencia digital a través de la cual se percibe una propiedad antes de visitarla.
>
> Hemos desarrollado un prototipo funcional tomando Villa Casia (Nueva Andalucía) como referencia de trabajo, bajo la tesis de *The Private Resort*: una residencia que se entiende por su vida exterior —la llegada, el agua, la reunión, el retiro— y no por su lista de estancias. La experiencia incluye recorrido por momentos del día, lógica espacial, concierge privado que responde sobre la villa y sobre el Valle del Golf, y solicitud de conversación privada.
>
> Escribo por una cuestión de forma. El prototipo está construido con fotografía sustituta con licencia, no con material de NVOGA, y no es público: lleva `noindex` y no se distribuye. Antes de enseñarlo con la identidad y las imágenes reales de Villa Casia, necesito su autorización por escrito.
>
> Lo que pediría, si les encaja:
>
> - autorización de uso de la fotografía de Villa Casia y del property film en una demo privada, no indexada y no distribuible;
> - confirmación de los datos que mostramos como verificados (parcela, superficie construida, orientación, gastos de comunidad e IBI);
> - si existe, plano y brochure en PDF.
>
> A cambio les paso el acceso a la experiencia completa de Villa Casia, sin coste ni compromiso. Si les resulta útil para la venta, hablamos. Si no, se retira el material y no queda nada publicado.
>
> ¿Les viene bien una llamada de quince minutos esta semana o la próxima?
>
> Un saludo,
> Jennifer — Larum Studio
> contacto@larumstudio.com

---

## Cuando llegue el sí

1. Guardar el email de autorización (es el documento que respalda la publicación).
2. Meter las fotos en `assets/` con la convención de nombres de `properties/README.md`.
3. Apuntar `properties/{slug}/assets.json` a los archivos nuevos y poner `"authorised": true`.
4. `node validate-content.js {slug}` — el aviso de fotografía sustituta debe desaparecer.
5. `node build-pack.js`.
6. Revisar si se puede levantar `noindex` (solo si la autorización cubre publicación, no únicamente demo privada).

**Fuentes de contacto:** [Christie's Madrid — contacto](https://www.christiesrealestate-madrid.com/en/contact) · [NVOGA — contacto](https://www.nvoga.com/contact/)
