'use strict';

const os = require('os');
const path = require('path');

module.exports = {
  inputs: {
    // admin endpoints
    AdminChainingUsers: ['AdminChainingUsersEntrypoint'],
    AdminEnqueueSRT: ['AdminEnqueueSRTEntrypoint'],
    AdminEditTopic: ['AdminEditTopicEntryPoint'],
    AdminEvents: ['AdminEventsEntrypoint'],
    AdminEventEdit: ['AdminEventEditEntrypoint'],
    AdminEventMonitorFeed: ['AdminEventMonitorFeedEntrypoint'],
    AdminEventStage: ['AdminEventStageEntrypoint'],
    AdminFBEvents: ['AdminFBEventsEntrypoint'],
    AdminLookupTopicalUsers: ['AdminLookupTopicalUsersEntryPoint'],
    AdminTrendingEvents: ['AdminTrendingEventsEntrypoint'],
    AdminTopicPortal: ['AdminTopicPortalEntrypoint'],
    AdminTopicRanking: ['AdminTopicRankingEntrypoint'],
    AdminTopicOnlineFeatures: ['AdminTopicOnlineFeaturesEntrypoint'],
    AdminTrendingEventRanking: ['AdminTrendingEventRankingEntrypoint'],
    AdminCrossChannelRanking: ['AdminCrossChannelRankingEntrypoint'],
    AdminExplorePhotos: ['AdminExplorePhotosEntrypoint'],
    AdminExploreQE: ['AdminExploreQEEntrypoint'],
    AdminHashtagLanding: ['AdminHashtagLandingEntrypoint'],
    AdminFeedRanking: ['AdminFeedRankingEntrypoint'],
    AdminKodachromeRanking: ['AdminKodachromeRankingEntrypoint'],
    AdminIndex: ['AdminIndexEntrypoint'],
    AdminNotificationSendTool: ['AdminNotificationSendToolEntrypoint'],
    AdminNudityTagList: ['AdminNudityTagListEntrypoint'],
    AdminOAuthClientHistory: ['AdminOAuthClientHistoryEntrypoint'],
    AdminPivots: ['AdminPivotsEntrypoint'],
    AdminMediaCovisitation: ['AdminMediaCovisitationEntrypoint'],
    AdminSuggestedUsers: ['AdminSuggestedUsersEntrypoint'],
    AdminSuggestedInvites: ['AdminSuggestedInvitesEntrypoint'],
    AdminSuggestedTopics: ['AdminSuggestedTopicsEntrypoint'],
    AdminTopicPage: ['AdminTopicPageEntrypoint'],
    AdminUnmigrateFollower: ['AdminUnmigrateFollowerEntryPoint'],
    AdminUserHistory: ['AdminUserHistoryEntrypoint'],
    AdminUserLabelSearch: ['AdminUserLabelSearchEntrypoint'],
    AdminViewCategory: ['AdminViewCategoryEntryPoint'],
    AdminWeeklyDigest: ['AdminWeeklyDigestEntrypoint'],
    BulkAddLabels: ['BulkAddLabelsEntrypoint'],
    Gatelogic: ['GatelogicEntrypoint'],
    GraphiQL: ['GraphiQLEntryPoint'],
    Runtime: ['RuntimeEntrypoint'],
    TestUser: ['TestUserEntrypoint'],
    TrendingUsers: ['TrendingUsersEntrypoint'],
    UsersProfilePics: ['UsersProfilePicsEntrypoint'],
    ReelNux: ['ReelNuxEntryPoint'],
    // core consumer endpoints
    ActivityFeed: [
      'ConsumerEntrypoint',
      'ActivityFeedPage',
    ],
    DirectoryPage: [
      'DirectoryPage',
    ],
    ExploreLandingPage: [
      'ConsumerEntrypoint',
      'ExploreLandingPageContainer',
    ],
    FeedPage: [
      'ConsumerEntrypoint',
      'FeedPageContainer',
      'AppInstallInterstitial',
    ],
    LandingPage: [
      'ConsumerEntrypoint',
      'LandingPage',
    ],
    LocationsPage: [
      'ConsumerEntrypoint',
      'LocationPageContainer',
    ],
    LoginAndSignupPage: [
      'ConsumerEntrypoint',
      'FBSignupPage',
      'LoginAndSignupPage',
    ],
    // TODO: REMOVE THIS, needs backend change first to use LoginAndSignupPage
    // instead.
    LoginPage: [
      'ConsumerEntrypoint',
      'LoginAndSignupPage',
    ],
    PostPage: [
      'ConsumerEntrypoint',
      'PostPageContainer',
    ],
    ProfilePage: [
      'ConsumerEntrypoint',
      'ProfilePageContainer',
    ],
    SettingsPages: [
      'ChangePasswordPageContainer',
      'CommentFilteringPageContainer',
      'ConsumerEntrypoint',
      'EmailPreferencesPageContainer',
      'ManageApplicationsPageContainer',
      'ProfileEditPageContainer',
    ],
    // TODO: REMOVE THIS, needs backend change first to use LoginAndSignupPage
    // instead.
    Signup: [
      'ConsumerEntrypoint',
      'FBSignupPage',
    ],
    TagPage: [
      'ConsumerEntrypoint',
      'TagPageContainer',
    ],
    // non-core consumer endpoints
    Badges: ['BadgesEntrypoint'],
    ConfirmFollowDialog: ['ConfirmFollowDialog'],
    EmailUnsubscribePage: ['EmailUnsubscribePageEntrypoint'],
    UsernameReclaimConfirmation: ['UsernameReclaimConfirmationEntrypoint'],
    EmbedPrelude: ['EmbedPrelude'],   // In head of rewritten embeds.
    EmbedPostlude: ['EmbedPostlude'], // At end of body of rewritten embeds.
    ProfileEmbed: ['ProfileEmbedEntrypoint'],
    EmbedsPlayground: ['EmbedsPlaygroundEntrypoint'],
    ReactComponent: ['ReactComponentEntrypoint'],
    Raters: ['RatersEntrypoint'],
    Report: ['ReportEntrypoint'],
    SupportInfo: ['SupportTicketEntrypoint'],
    Community: [
      'CommunityEntrypoint',
      'Community',
    ],
    PressPage: [
      'LegacyConsumerEntrypoint',
      'DesktopPressPage',
    ],
    GenericSurvey: ['GenericSurveyEntrypoint'],
  },

  output: {
    path: path.join(__dirname,'_build/packt'),
  },

  options: {
    workers: os.cpus().length -1,
  },

  context: {
  },

  resolvers: {
    custom: [
      {
        require: './build/packt/resolver',
        options: {
          modulePath: path.join(__dirname,'frontend/modules'),
          isPrerelease: true,
        }
      },
      {
        require: './build/packt/sprites-resolver',
        options: {
        }
      },
    ],
    default: {
      options: {
        searchPaths: [
          path.join(__dirname, 'shared/conf'),
          path.join(__dirname, 'node_modules/react/lib'),
          path.join(__dirname, 'frontend/modules'),
	        'node_modules',
        ],
        extensions: ['.js','.json','.gql','.scss','.css','.png','.jpg'],
      },
    },
  },

  handlers: [
    {
      pattern: '\\.js$',
      require: './build/packt/js-handler',
      options: {
        ignore: [
          '/node_modules/',
        ],
      },
    },
    {
      pattern: '\\.json$',
      require: './build/packt/json-handler',
      options: {
      },
    },
    {
      pattern: 'sprites/(.*)\\.css',
      require: './build/packt/ignore-handler',
      options: {
      },
    },
    {
      pattern: '\\.css$',
      require: './build/packt/css-handler',
      options: {
      },
    },
    {
      pattern: '\\.scss$',
      require: './build/packt/sass-handler',
      options: {
      },
    },
    {
      pattern: '\\.(jpg|png)$',
      require: './build/packt/ignore-handler',
      options: {
      },
    },
    {
      pattern: '\\.gql$',
      require: './build/packt/raw-handler',
      options: {
      },
    },
  ],
};
