# LARUM PROPERTY EXPERIENCE™
## AI Property Concierge — V2 Specification

**Estado:** V2 implementado (capa inteligente en prototipo)  
**Alcance:** texto, bilingüe, conocimiento profundo, scene-linked, interest-aware, qualification-aware, sin avatar ni voz

---

## 1. Propósito

Crear una capa de asesoramiento digital específica de cada propiedad que:

- comprenda la vivienda en profundidad (datos, espacios, sistemas);
- conecte respuestas con escenas, espacios y documentos reales;
- detecte intereses del visitante de forma progresiva;
- cualifique al visitante sin que se sienta como un formulario;
- prepare un resumen estructurado para el asesor humano;
- mantenga transparencia sobre sus límites.

---

## 2. Arquitectura V2

```
properties/{slug}/knowledge.json (deep knowledge base)
        ↓
LarumLoader (registry + validation)
        ↓
LarumAnalytics (interest detection + tracking)
        ↓
buildConciergeResponse() (intent matching + scene links + confidence)
        ↓
Chat UI (response with links + follow-up + qualification)
        ↓
buildAdvisorSummary() (structured handoff to agent)
```

---

## 3. Base de conocimiento (V2)

Cada propiedad tiene en `properties/{slug}/knowledge.json`:

### property.facts
Datos verificados con estado (`confirmed`, `pending`, `requires-advisor`) y fuente.

### property.systems
Sistemas de la propiedad (clima, domótica, piscina, jardín) con descripciones y scene links.

### property.spaces
Cada espacio con: descripción, tipo (private/social/outdoor/transition/system/wellness/entertainment), secuencia asociada, zona espacial.

### surroundings
Entorno: barrio, distancias, estilo de vida por momento del día, colegios, golf, restaurantes, playas, hospitales. Cada dato con estado.

### intents
Intenciones con: keywords, respuesta EN/ES, confidence, sceneLinks, spaceLinks, docLinks, followUp.

### interestSignals
Mapa de intereses → keywords para detección automática.

### qualification
Preguntas de cualificación progresiva con triggers (after_3_questions, interest_detected, high_intent).

---

## 4. Capacidades V2

### Respuestas enlazadas
Cada respuesta puede incluir:
- **Scene links**: botones que navegan a la secuencia relevante.
- **Space links**: botones que abren el overlay del espacio.
- **Doc links**: botones que llevan a la calculadora o documentos.
- **Confidence badge**: indica si el dato requiere confirmación del asesor.
- **Follow-up**: pregunta sugerida para profundizar.

### Detección de intereses
Cada mensaje del visitante se analiza contra `interestSignals` del knowledge pack. Los intereses detectados se acumulan y se muestran como tags en el concierge.

### Cualificación progresiva
El sistema puede insertar automáticamente preguntas de cualificación cuando:
- Se alcanzan 3 preguntas.
- Se detectan 2+ intereses distintos.
- Se detecta alta intención (qualified).

### Resumen para el asesor
Cuando el visitante abre el formulario de enquiry y está cualificado, se muestra un resumen con:
- Escenas exploradas.
- Espacios explorados.
- Intereses detectados.
- Número de preguntas.
- Uso de calculadora.
- Visualización del film.
- Duración de la sesión.
- Camino de entrada.

### Envío estructurado
Si `contact-config.json` tiene `endpoint`, el formulario envía JSON con:
- Datos de contacto.
- Propiedad.
- Idioma.
- Resumen completo (buildAdvisorSummary).
Si no hay endpoint, fallback a mailto enriquecido.

---

## 5. Reglas de respuesta (V2)

### Debe hacer

- responder con datos del knowledge pack y su confidence;
- enlazar a escenas y espacios relevantes;
- distinguir confirmed de pending/requires-advisor;
- reconocer incertidumbre con badge visible;
- ofrecer follow-up relevante;
- detectar intereses sin preguntar directamente;
- transferir preguntas sensibles al asesor;
- mantener tono discreto, informado y humano.

### No debe hacer

- inventar superficies, distancias o servicios;
- afirmar disponibilidad;
- prometer rentabilidades;
- dar asesoramiento legal o fiscal;
- hacerse pasar por el asesor humano;
- responder con seguridad cuando confidence ≠ confirmed;
- forzar cualificación antes de que sea natural.

---

## 6. Intents actuales por propiedad

### Madrid M1558
- light (luz, patios, ventanales)
- technology (domótica, aerotermia, suelo radiante)
- price (precio, coste, presupuesto)
- bedrooms (dormitorios, baños, suite)
- terrace (terraza, exterior, vista, skyline)
- location (ubicación, Goya, Salamanca, entorno)
- privacy (privacidad, calma, silencio)
- investment (inversión, rentabilidad, reventa)

### Villa Casia
- water (piscina, agua, infinity)
- price (precio, coste, presupuesto)
- entertain (invitados, amigos, social, reuniones)
- wellness (spa, cine, retiro)
- garden (jardín, paisaje, exterior, vegetación)
- location (ubicación, Nueva Andalucía, Golf Valley, Marbella)
- privacy (privacidad, calma, silencio)
- investment (inversión, alquiler, holiday rental)

---

## 7. Analytics & tracking

Todo se registra en `LarumAnalytics`:
- chapter_enter, scene_open, space_open
- concierge_question (con intentId e interests)
- document_request, calculator_use, film_watch
- enquiry, entry_path, interest_signal

Persistencia en localStorage. Sin llamadas externas.

---

## 8. Evolución posterior

- Sustituir matching por keywords por retrieval sobre base de conocimiento completa.
- Conectar a LLM para respuestas más naturales (manteniendo knowledge pack como fuente de verdad).
- Integración con CRM para lead management.
- Buyer room privado para documentos adicionales.
- Personalización de la experiencia según intereses detectados.

---

## 9. Criterio de éxito V2

El Concierge V2 funciona si:

- responde de forma específica y enlazada a la propiedad;
- cada respuesta puede llevar al visitante a una escena o espacio relevante;
- detecta intereses sin que el visitante se sienta interrogado;
- cualifica de forma progresiva y natural;
- genera un resumen útil para el asesor;
- no promete lo que no está confirmado;
- se siente como una conversación, no como un formulario.
