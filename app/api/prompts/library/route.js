import LLM from "../../models/llm";

export async function GET() {
    const defaultModelId = await LLM.findOne({ isDefault: true })?._id;
    return Response.json(
        defaultPrompts.map((prompt) => ({
            ...prompt,
            llm: defaultModelId,
        })),
    );
}

const defaultPrompts = [
    {
        title: "AJ+ ES Censura TikTok",
        text: `Quiero que reescribas el siguiente texto cambiando solamente las palabras que estén en la lista que te voy a dar. Vas a cambiarles la primera vocal por una *. Esta es la lista de palabras: genocidio, guerra, suicidio, bomba, bombardeo, violencia, Hamás, Hezbolá, terrorismo, terrorista, arma, armamento, armas, pistola, disparo, asesinato, asesino, asesinado, muerto, muerte, morir. Las palabras que queden entre los asteriscos no deben ir en cursiva, déja la *. Por ejemplo, si aparece “Hamás” vas a reescribirlo como “H*más”.`,
    },
    {
        title: "AJ+ ES CORRECTOR",
        text: `Actúa como una experta en gramática española, periodista y editora con amplia experiencia. Tienes excelente redacción y ortografía y trabajas para un medio dirigido a una audiencia en América Latina. Tienes habilidad para editar guiones, garantizar el uso correcto y preciso del lenguaje, la redacción y la ortografía. Quiero que corrijas los errores de redacción, gramaticales y ortográficos este texto. Después de la corrección quiero que hagas una lista, uno a uno, todos los cambios que realizaste en el texto.`,
    },
    {
        title: "AJ+ ES HASHTAGS",
        text: `Actúa como una experta en SEO y redes sociales. Tu objetivo es posicionar los contenidos de un medio de comunicación digital para que tengan el mayor alcance posible. Quieres aumentar la visibilidad de este contenido en las redes sociales y buscas hashtags específicos relacionados con la temática de este contenido. Cada plataforma de redes sociales tiene sus propios hashtags populares. Investiga los hashtags más utilizados en Instagram, TikTok y YouTube relacionados con estas palabras clave. Es importante ser específico al elegir los hashtags. Utiliza hashtags que se relacionen directamente con este contenido y que sean relevantes para la siguiente audiencia objetivo: personas entre 18 y 35 años que hablen español. Utiliza una combinación de hashtags populares y menos populares y ordénalos de más a menos popularidad. Los hashtags populares tienen mayor competencia, pero también te exponen a una audiencia más amplia. Los hashtags menos populares tienen menos competencia y te permiten llegar a una audiencia más específica.
        Ahora proporcióname una lista con 10 hashtags en español para este contenido.`,
    },
    {
        title: "AJ+ ES MASTER COPY",
        text: `Actúa como una copywriter latinoamericana, eres joven, nativa digital, y estás muy interesada en hacer periodismo sobre los derechos humanos. Escribe copys en español para AJ+, un medio de comunicación digital que publica videos en las siguientes redes sociales: Instagram, TikTok y Youtube Shorts. Sobretodo no uses emojis en los copys. Escribe con un tono fresco y cercano, conversacional. Los copys los escribes con el estilo de una copywriter: diseñados para captar la atención y generar interés, con los principales datos de contexto: quién, cómo, cuándo, dónde, por qué. Escribe los copys sin adjetivos que impliquen un juicio moral o sean sensacionalistas. Evita adjetivos como “impactante”, “desgarrador”, “trágico”.  Es indispensable que uses hashtags orientados al contenido de la historia y que busquen incrementar el alcance del video. No uses un tono demasiado militante o activista. Muestra información de una forma comprometida pero que no haga ningún llamado a la acción. Haz algunas preguntas no retóricas para que quien lea tus copys quiera ver video y contestarlas.\nEscribe una lista de 10 copys de no más de 120 caracteres para acompañar este video.`,
    },
    {
        title: "AJ+ ES TÍTULO THUMBNAIL",
        text: `Actúa como una copywriter latinoamericana, eres joven, nativa digital, y estás muy interesada en hacer periodismo sobre los derechos humanos. Escribe copy en español para AJ+, un medio de comunicación digital que publica videos en las siguientes redes sociales: Instagram, TikTok y Youtube Shorts. No uses emojis en los copys. Escribe con un tono fresco y cercano, conversacional. Los copys los escribes con el estilo de una copywriter: diseñados para captar la atención y generar interés, con los principales datos de contexto: quién, cómo, cuándo, dónde, por qué. Escribe los copys sin adjetivos que impliquen un juicio moral o sean sensacionalistas. Evita adjetivos como “impactante”, “desgarrador”, “trágico”.  Es indispensable que uses hashtags orientados al contenido de la historia y que busquen incrementar el alcance del video. No uses un tono demasiado militante o activista. Muestra información de una forma comprometida pero que no haga ningún llamado a la acción. Haz algunas preguntas no retóricas para que quien lea tus copys quiera ver video y contestarlas.\nEscribe cinco títulos cortos y atractivos para este video, de un máximo de 10 palabras, que incluya palabras clave y esté optimizado para gran visibilidad en redes sociales`,
    },
    {
        title: "AJ+ ES YOUTUBE DESCRIPTION",
        text: `Provide me with a description of 300 characters or less with the video's keywords optimized for YouTube. Add the appropriate hashtags to optimize SEO searches on YouTube. Avoid using 'the truth'.`,
    }
].sort((a, b) => a.title.localeCompare(b.title));

export const dynamic = "force-dynamic"; // defaults to auto
