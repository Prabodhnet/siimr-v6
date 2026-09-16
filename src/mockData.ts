import { Dream, ClipItem, NearbySticker, DirectMessageItem } from './types';

export const INITIAL_DREAMS: Dream[] = [
  {
    id: 'dream-1',
    title: 'THE ELEVATOR ONLY WENT SIDEWAYS',
    hook: '"It didn\'t go up or down, just left into a quiet forest."',
    content: 'Every floor button led to the same hallway, just painted a different color each time. I never found the lobby, and somehow that felt normal — like the building had always worked this way and I was the one who forgotten.',
    author: {
      id: 'u-amara',
      name: 'Amara T.',
      handle: '@amara',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      initials: 'A',
      color: '#5438FF',
    },
    timeAgo: '2h ago',
    capturedTime: 'captured 6:12 am',
    category: 'Surreal',
    tags: ['Places', 'Surreal', 'Corridors'],
    audience: 'public',
    isNearbyEligible: true,
    region: 'Bhubaneswar area',
    likes: 142,
    commentsCount: 2,
    viewsCount: 2310,
    isLiked: false,
    isSaved: false,
    hasClip: false,
    mediaType: 'illustration',
    cardColor: '#D8D4FF',
    cardBorderColor: '#C0B9FF',
    cardTextColor: '#1A1C23',
    similarDreamPrompt: 'Someone else dreamed about elevators too →',
    similarDreamId: 'dream-2',
    comments: [
      {
        id: 'c-1',
        authorName: 'JOSH',
        text: 'I had a hallway dream like this last month too',
        timestamp: '1h ago',
        authorColor: '#5438FF'
      },
      {
        id: 'c-2',
        authorName: 'PRIYA',
        text: 'the "always worked this way" part is exactly it',
        timestamp: '45m ago',
        authorColor: '#1A1C23'
      }
    ],
    circleThreads: [
      {
        id: 'th-1',
        dreamId: 'dream-1',
        title: 'Sideways gravity and architectural loops in dreaming',
        authorName: 'Devan',
        authorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80',
        timestamp: '1h ago',
        repliesCount: 4,
        initialPost: 'Did the elevator sound mechanical or was it silent gliding? In mine, horizontal transit usually indicates trying to move sideways around a problem instead of advancing.',
        replies: [
          {
            id: 'tr-1',
            authorName: 'Amara T.',
            text: 'Completely silent! It hummed like cold copper.',
            timestamp: '50m ago'
          },
          {
            id: 'tr-2',
            authorName: 'Josh',
            text: 'I notice whenever doors open into trees, you wake up feeling like you left something behind.',
            timestamp: '30m ago'
          }
        ]
      }
    ]
  },
  {
    id: 'dream-2',
    title: 'A DOOR MADE OF WATER',
    hook: '"Some doors only appear in dreams."',
    content: 'I don’t usually dream in color, but this felt so real... It was standing right at the edge of the hallway, a membrane of liquid that rippled when I approached. When I stepped through, I could breathe normally, but sound carried like bells through deep water.',
    author: {
      id: 'u-bhumika',
      name: 'Bhumika',
      handle: '@bhumika',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80',
      initials: 'B',
      color: '#5438FF',
    },
    timeAgo: '2h ago',
    capturedTime: 'captured 5:48 am',
    category: 'Lucid',
    tags: ['Lucid', 'DreamPlaces', 'Surreal'],
    audience: 'public',
    isNearbyEligible: true,
    region: 'Bhubaneswar area',
    likes: 1400,
    commentsCount: 342,
    viewsCount: 6200,
    isLiked: true,
    isSaved: true,
    hasClip: true,
    clipDuration: '00:28',
    clipVideoUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80',
    mediaType: 'landscape',
    cardColor: '#D2E7FF',
    cardBorderColor: '#B4D5FF',
    cardTextColor: '#1A1C23',
    visualQuote: 'Some doors only appear in dreams.',
    comments: [
      {
        id: 'c-201',
        authorName: 'TATIANA',
        text: 'Did the water have temperature? Was it cold or room temp?',
        timestamp: '1h ago',
        authorColor: '#7064F6'
      },
      {
        id: 'c-202',
        authorName: 'MAYA',
        text: 'Water doorways are a classic portal motif before lucid waking.',
        timestamp: '30m ago',
        authorColor: '#5438FF'
      }
    ],
    circleThreads: [
      {
        id: 'th-water-1',
        dreamId: 'dream-2',
        title: 'Water doorways & the lucid threshold',
        authorName: 'Josh',
        authorAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80',
        timestamp: '2h ago',
        repliesCount: 6,
        initialPost: 'Has anyone else touched a liquid surface in a dream and felt zero wetness on your skin afterwards?',
        replies: [
          {
            id: 'tr-w-1',
            authorName: 'Bhumika',
            text: 'Yes! It felt silky like mercury, but perfectly dry.',
            timestamp: '1h ago'
          }
        ]
      }
    ]
  },
  {
    id: 'dream-3',
    title: 'THE SKY HAD STAIRS',
    hook: '"Each cloud was carved like limestone stairs."',
    content: 'The stairs went straight up toward a pale blue ceiling. Nobody else in the town seemed bothered by them, they were just walking up with baskets and newspapers as if it were a morning commute into the sky.',
    author: {
      id: 'u-josh',
      name: 'Josh',
      handle: '@josh',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
      initials: 'J',
      color: '#5438FF',
    },
    timeAgo: '4h ago',
    capturedTime: 'captured 4:30 am',
    category: 'Surreal',
    tags: ['Falling', 'Sky', 'About Flying'],
    audience: 'public',
    isNearbyEligible: true,
    region: 'Bhubaneswar area',
    likes: 318,
    commentsCount: 24,
    viewsCount: 1420,
    isLiked: false,
    isSaved: false,
    hasClip: false,
    mediaType: 'illustration',
    cardColor: '#D8EBD9',
    cardBorderColor: '#BCD8BE',
    cardTextColor: '#1A1C23',
    comments: [
      {
        id: 'c-301',
        authorName: 'AMARA',
        text: 'Did the stairs wobble or feel solid like stone?',
        timestamp: '3h ago',
        authorColor: '#5438FF'
      }
    ]
  },
  {
    id: 'dream-4',
    title: 'I KEPT TRYING TO PAY WITH THE WRONG CURRENCY',
    hook: '"Coins that turned to leaves the second the cashier touched them..."',
    content: 'I needed bus fare, but my pockets were filled with bronze coins stamped with birds. Every time I placed one in the cashier\'s palm, it dried into an autumn birch leaf. The bus kept waiting, neither moving nor letting me board.',
    author: {
      id: 'u-me',
      name: 'Isha',
      handle: '@bhumika',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      initials: 'I',
      color: '#5438FF',
    },
    timeAgo: '6 Sept',
    capturedTime: 'captured 7:02 am',
    category: 'Recurring',
    tags: ['Recurring', 'Coins', 'Transit'],
    audience: 'public',
    isNearbyEligible: true,
    region: 'Bhubaneswar area',
    likes: 31,
    commentsCount: 8,
    viewsCount: 420,
    isLiked: false,
    isSaved: false,
    hasClip: false,
    mediaType: 'minimal',
    cardColor: '#FFE1D6',
    cardBorderColor: '#F7C4B2',
    cardTextColor: '#1A1C23',
    comments: []
  },
  {
    id: 'dream-5',
    title: 'THE OCEAN WAS ON THE CEILING',
    hook: '"Calm, not falling — just there, upside down."',
    content: 'Looking up from my bedroom, waves were gently rolling across the plaster, illuminated by distant moonlight. Fish swam lazily past the chandelier without a drop falling on the carpet.',
    author: {
      id: 'u-me',
      name: 'Isha',
      handle: '@bhumika',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      initials: 'I',
      color: '#5438FF',
    },
    timeAgo: '1 Sept',
    capturedTime: 'captured 6:40 am',
    category: 'Surreal',
    tags: ['Surreal', 'Water', 'Bedroom'],
    audience: 'public',
    isNearbyEligible: true,
    region: 'Bhubaneswar area',
    likes: 49,
    commentsCount: 8,
    viewsCount: 650,
    isLiked: false,
    isSaved: false,
    hasClip: false,
    mediaType: 'minimal',
    cardColor: '#1E1B38',
    cardBorderColor: '#342F5C',
    cardTextColor: '#FFFFFF',
    comments: []
  },
  {
    id: 'dream-6',
    title: 'MY CHILDHOOD DOG LED ME THROUGH A TRAIN STATION',
    hook: '"He wore a little conductor whistle around his collar."',
    content: 'Rusty had been gone for 10 years, but he walked ahead of me down platform 9, looking back every 10 steps to make sure I had my boarding pass. We took a train that had no roof, through warm summer rain.',
    author: {
      id: 'u-me',
      name: 'Isha',
      handle: '@bhumika',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      initials: 'I',
      color: '#5438FF',
    },
    timeAgo: '5 Sept',
    capturedTime: 'captured 6:15 am',
    category: 'Recurring',
    tags: ['Animals', 'Memory', 'Train'],
    audience: 'public',
    isNearbyEligible: true,
    region: 'Bhubaneswar area',
    likes: 51,
    commentsCount: 6,
    viewsCount: 510,
    isLiked: false,
    isSaved: false,
    hasClip: false,
    mediaType: 'minimal',
    comments: []
  }
];

export const CLIP_ITEMS: ClipItem[] = [
  {
    id: 'clip-1',
    dreamId: 'dream-2',
    title: 'a door made of water',
    hook: 'I don’t usually dream in color, but this felt so real... Here’s what happened...',
    quote: '“Some doors only appear in dreams.”',
    creator: {
      name: 'Bhumika',
      handle: '@bhumika',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80',
      timeAgo: '2h ago'
    },
    tags: ['#Lucid', '#DreamPlaces', '#Surreal'],
    videoOrImageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80',
    currentTime: '00:12',
    totalTime: '00:28',
    likes: 1400,
    commentsCount: 342,
    viewsCount: 6200,
    isLiked: true,
    isSaved: true
  },
  {
    id: 'clip-2',
    dreamId: 'dream-1',
    title: 'The elevator only went sideways',
    hook: 'I woke up and recorded this before 6:30 am because the forest scent was still in my room.',
    quote: '“It didn’t go up or down, just sideways into trees.”',
    creator: {
      name: 'Amara T.',
      handle: '@amara',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      timeAgo: '3h ago'
    },
    tags: ['#Surreal', '#Corridors', '#Places'],
    videoOrImageUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=800&q=80',
    currentTime: '00:08',
    totalTime: '00:22',
    likes: 890,
    commentsCount: 114,
    viewsCount: 3900,
    isLiked: false,
    isSaved: false
  }
];

export const NEARBY_STICKERS: NearbySticker[] = [
  {
    id: 'st-1',
    quote: '"the sky had stairs"',
    author: 'Josh · Falling',
    motif: 'Falling',
    bgType: 'cream',
    rotation: 8,
    position: { top: 82, right: -14 },
    dreamId: 'dream-3'
  },
  {
    id: 'st-2',
    quote: '"a very calm flood, ankle-deep everywhere"',
    author: '6 nearby · Water',
    motif: 'Water',
    bgType: 'blush',
    rotation: -6,
    position: { top: 168, right: 34 },
    dreamId: 'dream-2'
  },
  {
    id: 'st-3',
    quote: '"chased, but only walking speed"',
    author: 'Priya · Chased',
    motif: 'Chased',
    bgType: 'lavender',
    rotation: -4,
    position: { top: 300, left: 22 },
    dreamId: 'dream-1'
  },
  {
    id: 'st-4',
    quote: '"my old school, rearranged"',
    author: 'Maya · School',
    motif: 'School',
    bgType: 'cyan',
    rotation: 5,
    position: { top: 390, right: 20 },
    dreamId: 'dream-1'
  },
  {
    id: 'st-5',
    quote: '"could breathe underwater, forgot how on land"',
    author: 'Devan · Water',
    motif: 'Water',
    bgType: 'cream',
    rotation: -8,
    position: { top: 480, left: 60 },
    dreamId: 'dream-2'
  }
];

export const DIRECT_MESSAGES: DirectMessageItem[] = [
  {
    id: 'msg-1',
    senderName: 'Phillip Franci',
    senderAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80',
    previewText: "Hey, it's been a while since we've...",
    timestamp: '10:00 am',
    isPinned: true,
    status: 'online',
    messages: [
      { id: 'm1', sender: 'them', text: "Hey, it's been a while since we compared dream logs! Did you have that recurring train dream again?", time: '9:58 am' },
      { id: 'm2', sender: 'me', text: 'Yes, just yesterday! My childhood dog was waiting on platform 9.', time: '10:00 am' }
    ]
  },
  {
    id: 'msg-2',
    senderName: 'Alfredo Saris',
    senderAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80',
    previewText: 'Hello, Good Morning Bro!',
    timestamp: '08:00 am',
    unreadCount: 1,
    isPinned: true,
    status: 'sleeping',
    messages: [
      { id: 'm3', sender: 'them', text: 'Hello, Good Morning Bro! Checking if you saw the nearby dream cluster about water doors?', time: '8:00 am' }
    ]
  },
  {
    id: 'msg-3',
    senderName: 'Jaylon Franci',
    senderAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80',
    previewText: "Everything's good.",
    timestamp: '08:30 am',
    status: 'online',
    messages: [
      { id: 'm4', sender: 'them', text: "Everything's good. Catch you in the evening Dream Circle.", time: '8:30 am' }
    ]
  },
  {
    id: 'msg-4',
    senderName: 'Tatiana Dorwart',
    senderAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=120&q=80',
    previewText: 'Okay Thanks!',
    timestamp: '06:10 am',
    status: 'sleeping',
    messages: [
      { id: 'm5', sender: 'them', text: 'Okay Thanks! Saved your dream clip to revisit.', time: '6:10 am' }
    ]
  },
  {
    id: 'msg-5',
    senderName: 'Terry Bergson',
    senderAvatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=120&q=80',
    previewText: 'Same here!',
    timestamp: '12:40 am',
    status: 'online',
    messages: [
      { id: 'm6', sender: 'them', text: 'Same here! Looked like we shared the same sky stairs motif last night.', time: '12:40 am' }
    ]
  }
];

export const mockDreams = INITIAL_DREAMS;
export const mockClips = CLIP_ITEMS;
export const mockMessages = DIRECT_MESSAGES;
