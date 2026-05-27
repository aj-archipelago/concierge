import config from "../../../../config";

export async function GET() {
    const defaultModelId = config.cortex.defaultChatModel;
    return Response.json(
        defaultPrompts.map((prompt) => ({
            ...prompt,
            llm: defaultModelId,
        })),
    );
}

const defaultPrompts = [
    {
        title: "ES Platform-Safe Copy",
        text: `Quiero que reescribas el siguiente texto para reducir el riesgo de bloqueo en plataformas sociales sin cambiar los hechos ni el significado. Mantén un tono claro, responsable y profesional. Evita lenguaje sensacionalista, emojis y llamadas a la acción innecesarias. Después de la versión revisada, enumera brevemente los cambios principales.`,
    },
    {
        title: "ES Corrector",
        text: `Actúa como una experta en gramática española y edición con amplia experiencia. Tienes excelente redacción y ortografía y escribes para una audiencia en América Latina. Corrige los errores de redacción, gramática y ortografía del siguiente texto. Después de la corrección, lista uno a uno los cambios que realizaste.`,
    },
    {
        title: "ES Hashtags",
        text: `Actúa como una experta en SEO y redes sociales. Tu objetivo es posicionar los contenidos de un medio de comunicación digital para que tengan el mayor alcance posible. Quieres aumentar la visibilidad de este contenido en las redes sociales y buscas hashtags específicos relacionados con la temática de este contenido. Cada plataforma de redes sociales tiene sus propios hashtags populares. Investiga los hashtags más utilizados en Instagram, TikTok y YouTube relacionados con estas palabras clave. Es importante ser específico al elegir los hashtags. Utiliza hashtags que se relacionen directamente con este contenido y que sean relevantes para la siguiente audiencia objetivo: personas entre 18 y 35 años que hablen español. Utiliza una combinación de hashtags populares y menos populares y ordénalos de más a menos popularidad. Los hashtags populares tienen mayor competencia, pero también te exponen a una audiencia más amplia. Los hashtags menos populares tienen menos competencia y te permiten llegar a una audiencia más específica.
        Ahora proporcióname una lista con 10 hashtags en español para este contenido.`,
    },
    {
        title: "ES Social Copy",
        text: `Actúa como una copywriter latinoamericana, nativa digital, con experiencia en contenidos informativos para redes sociales. Escribe copys en español para un video que se publicará en Instagram, TikTok y YouTube Shorts. No uses emojis. Escribe con un tono fresco, cercano y conversacional. Incluye los principales datos de contexto: quién, cómo, cuándo, dónde y por qué. Evita adjetivos sensacionalistas como "impactante", "desgarrador" o "trágico". Usa hashtags relevantes para el contenido y algunas preguntas no retóricas que inviten a ver el video.\nEscribe una lista de 10 copys de no más de 120 caracteres para acompañar este video.`,
    },
    {
        title: "ES Thumbnail Titles",
        text: `Actúa como una copywriter latinoamericana con experiencia en contenidos informativos para redes sociales. Escribe cinco títulos cortos y atractivos para este video, de un máximo de 10 palabras. Incluye palabras clave, evita emojis y evita adjetivos sensacionalistas. Los títulos deben ser claros, precisos y optimizados para visibilidad en redes sociales.`,
    },
    {
        title: "YouTube Description",
        text: `Provide me with a description of 300 characters or less with the video's keywords optimized for YouTube. Add the appropriate hashtags to optimize SEO searches on YouTube. Avoid using 'the truth'.`,
    },
].sort((a, b) => a.title.localeCompare(b.title));

export const dynamic = "force-dynamic"; // defaults to auto
