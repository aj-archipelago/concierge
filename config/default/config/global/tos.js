export const getTosContent = (language) => {
    return (
        <>
            <p>
                The Concierge app is now in Alpha. We want people to enjoy using
                it and test the functionality, but please expect some
                instability and slowness, particularly around GPT-4 features,
                which are in pre-release.
            </p>

            <p>
                To ensure responsible and ethical use of Concierge, the user
                agrees to the following terms and conditions:
            </p>

            <ul className="mb-3 list-disc ps-4">
                <li>
                    The user agrees not to share the output of any interactions
                    with Concierge publicly, as this could potentially cause
                    harm. This includes using any translation, summaries, text
                    compositions, or code in the creation of content or products
                    without careful verification that the output conforms to our
                    corporate standards.
                </li>

                <li>
                    Although we have tried to tune Concierge to be accurate and
                    responsible, please note that using AI to do translation can
                    sometimes produce unexpected results. Please review the
                    translation carefully for correctness, especially for facts
                    such as names of people, places, cities, countries, and
                    other entities.
                </li>

                <li>
                    Concierge's output may contain errors, inaccuracies,
                    offensive content, or other problems that could potentially
                    cause harm. The user agrees to use Concierge at their own
                    risk.
                </li>

                <li>
                    Anything you enter into Concierge is not guaranteed to be
                    private. The user agrees that any information they enter
                    into Concierge may be stored and used for any purpose,
                    including but not limited to improving Concierge's
                    performance and accuracy, and for any other purpose that we
                    deem appropriate.
                </li>
            </ul>

            <p>
                If you have any questions or concerns about using Concierge,
                please contact us. You can find us on Slack or send an email to
                mail@example.com.
            </p>
        </>
    );
};
