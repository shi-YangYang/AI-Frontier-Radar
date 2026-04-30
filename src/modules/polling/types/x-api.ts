export interface XApiErrorItem {
  detail?: string;
  title?: string;
  type?: string;
  value?: string;
}

export interface XApiReferencedTweet {
  id: string;
  type: 'quoted' | 'replied_to' | 'retweeted';
}

export interface XApiTweet {
  author_id?: string;
  conversation_id?: string;
  created_at?: string;
  id: string;
  referenced_tweets?: XApiReferencedTweet[];
  text?: string;
}

export interface XApiTimelineMeta {
  newest_id?: string;
  oldest_id?: string;
  result_count?: number;
}

export interface XApiUser {
  id: string;
  name?: string;
  username?: string;
}

export interface XApiTimelineResponse {
  data?: XApiTweet[];
  errors?: XApiErrorItem[];
  meta?: XApiTimelineMeta;
}

export interface XApiUserLookupResponse {
  data?: XApiUser;
  errors?: XApiErrorItem[];
}
