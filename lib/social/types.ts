// Datentypen für das Social-Media-Modul. Spiegeln die Tabellen aus Migration 109.

import type { MediaKind, Platform, PostFormat, PostStatus } from "./format";

export type { MediaKind, Platform, PostFormat, PostStatus };

export interface SocialBoard {
  id: string;
  lead_id: string;
  share_token: string | null;
  share_enabled: boolean;
  client_label: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SocialPost {
  id: string;
  board_id: string;
  lead_id: string;
  title: string | null;
  format: PostFormat;
  status: PostStatus;
  platforms: Platform[];
  caption: string;
  platform_captions: Partial<Record<Platform, string>>;
  scheduled_at: string | null;
  sort_order: number;
  approved_at: string | null;
  approved_by_name: string | null;
  review_requested_at: string | null;
  published_at: string | null;
  external_post_ids: Partial<Record<Platform, string>> | null;
  publish_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SocialPostMedia {
  id: string;
  post_id: string;
  lead_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  media_kind: MediaKind;
  sort_order: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  created_by: string | null;
  created_at: string;
}

/** An den Client gereichte Sicht eines Mediums: ohne storage_path, mit signed URL. */
export interface LoadedPostMedia {
  id: string;
  post_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  media_kind: MediaKind;
  sort_order: number;
  signed_url: string | null;
}

export interface SocialComment {
  id: string;
  post_id: string;
  board_id: string;
  author_kind: "client" | "team";
  author_user_id: string | null;
  author_name: string | null;
  body: string;
  event: "approved" | "changes_requested" | "viewed" | null;
  created_at: string;
}

/** Post mit geladenen Medien + Kommentar-Zähler (für Board/Liste). */
export interface PostWithMedia extends SocialPost {
  media: LoadedPostMedia[];
  comment_count: number;
}

/** Post mit Medien + vollständigem Kommentar-Thread (für Detail/öffentliche Karte). */
export interface PostWithMediaAndComments extends SocialPost {
  media: LoadedPostMedia[];
  comments: SocialComment[];
}
