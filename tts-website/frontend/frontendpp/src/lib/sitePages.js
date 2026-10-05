export const SITE_PAGES = [
  {
    slug: 'about',
    title: 'About VoiceForge',
    description: 'Learn about VoiceForge, a collection of browser-based audio and voice tools for creators.',
    heading: 'About VoiceForge',
    intro:
      'VoiceForge is a creator toolkit for everyday audio and voice work, from making voiceovers to editing, converting and analyzing audio.',
    sections: [
      {
        title: 'Tools for audio workflows',
        paragraphs: [
          'The toolkit brings related tasks together: text-to-speech, live dictation, subtitle conversion, audio length adjustment, and AudioKit tools for editing, recording, effects and analysis.',
          'Some features process files in your browser. Features that require speech generation or subtitle conversion send the necessary input to the VoiceForge backend; each tool explains its workflow on its page.',
        ],
      },
      {
        title: 'Built for practical use',
        paragraphs: [
          'VoiceForge is designed to make common creator tasks easy to find and complete without installing desktop software. Tool availability and browser support can vary by feature.',
        ],
      },
    ],
  },
  {
    slug: 'privacy',
    title: 'Privacy',
    description: 'Learn how VoiceForge handles browser storage and data submitted to audio and voice tools.',
    heading: 'Privacy',
    intro:
      'This page explains the data handling visible in the VoiceForge app. Avoid submitting sensitive information unless you are comfortable sending it to the service required by that tool.',
    sections: [
      {
        title: 'Browser-based tools',
        paragraphs: [
          'AudioKit and Audio Length process selected audio in the browser. Their audio processing does not upload the source audio to the VoiceForge backend.',
          'Speech to Text uses the browser Web Speech API. Recognition behavior and any audio transmission depend on the browser and its speech service, so check your browser’s privacy settings for details.',
        ],
      },
      {
        title: 'Tools that use the backend',
        paragraphs: [
          'Text to Speech sends text or a transcript to the VoiceForge backend to generate speech. Subtitle Studio sends the subtitle or script content for conversion. The backend returns the generated result to the browser.',
          'This app does not state a backend retention period here. Do not submit confidential or sensitive content unless you have confirmed that the service’s handling meets your needs.',
        ],
      },
      {
        title: 'Browser preferences',
        paragraphs: [
          'The app stores interface preferences such as theme and favourites in browser storage so they can persist between visits. You can clear this data using your browser’s site-data controls.',
        ],
      },
    ],
  },
  {
    slug: 'terms',
    title: 'Terms of Use',
    description: 'Read the basic terms for using VoiceForge audio and voice tools.',
    heading: 'Terms of Use',
    intro:
      'By using VoiceForge, you agree to use the site and its tools lawfully and responsibly.',
    sections: [
      {
        title: 'Your content and outputs',
        paragraphs: [
          'You are responsible for having the rights and permissions needed to use any text, audio or other material you provide. You are also responsible for reviewing generated or converted output before publishing or relying on it.',
          'Do not use the service to violate another person’s rights, break the law, disrupt the service or attempt to access systems without authorization.',
        ],
      },
      {
        title: 'Availability and accuracy',
        paragraphs: [
          'Tools are provided for general creator workflows. Results may be incomplete or inaccurate, browser capabilities differ, and the service may change or become unavailable.',
          'Use your own judgment when relying on output, especially for accessibility, legal, medical, financial or other consequential purposes.',
        ],
      },
      {
        title: 'Changes',
        paragraphs: [
          'Features and these terms may be updated as the toolkit changes. Continued use after an update means you accept the revised terms.',
        ],
      },
    ],
  },
];

export const sitePagePath = (page) => `/${page.slug}`;

export function sitePageSeo(page) {
  return {
    title: `${page.title} | VoiceForge`,
    description: page.description,
    path: sitePagePath(page),
    jsonLd: [],
  };
}
