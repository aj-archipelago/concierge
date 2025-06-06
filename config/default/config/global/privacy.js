export const getPrivacyContent = (language) => {
    return {
        markup: (
            <>
                <p>
                    {/* Default privacy notice placeholder. Replace or extend this content as needed for your distribution. */}
                    The Concierge application does not collect or store any personal data outside of what is required for basic functionality.
                    No user identifiable information is retained beyond the scope of the current session.
                </p>
            </>
        ),
        scripts: [],
        noticeUrls: [],
    };
}; 