/**
 * RenderArticles Component
 *
 * This component is responsible for rendering a list of articles.
 * It takes an array of article objects as a prop and creates a structured list.
 *
 * @param {Array} topArticles - An array of article objects to be rendered
 * @returns {JSX.Element} A list of article items
 */

const RenderArticles = (topArticles) => {
    return (
        <ul className="top-articles-list">
            {topArticles.map((article) => (
                <li
                    key={article.id}
                    className="article-item"
                    data-post-id={article.id}
                >
                    <img src={article.thumbnail} alt={article.title} />
                    <div className="text-container">
                        <p>{article.title}</p>
                        <a
                            href={article.permalink}
                            target="_blank"
                            className="article-link"
                            rel="noreferrer"
                        >
                            Link
                        </a>
                    </div>
                    <div className="label-wrapper">
                        <input
                            type="radio"
                            id={`response${article.id}`}
                            name="response"
                        />
                        <label htmlFor={`response${article.id}`}></label>
                    </div>
                </li>
            ))}
        </ul>
    );
};

export default RenderArticles;
