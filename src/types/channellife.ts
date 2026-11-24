export type RequestType = 'new_channel' | 'join_channel';

export type RequestStatus = 'Nuova' | 'In valutazione' | 'Approvata' | 'Rifiutata';

export interface Category {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  channelCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicChannel {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  description: string;
  officialUrl: string;
  imageUrl: string | null;
  verified: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface AdminChannel extends PublicChannel {
  published: boolean;
  ownerPhone: string | null;
  clickCount: number;
  createdAt: string;
}

export interface ChannelRequest {
  id: string;
  type: RequestType;
  channelName: string;
  description: string | null;
  officialUrl: string | null;
  motivation: string;
  notes: string | null;
  email: string;
  phone: string;
  status: RequestStatus;
  confirmationSent: boolean;
  linkedChannelId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminOverviewStats {
  publishedChannels: number;
  totalChannels: number;
  totalCategories: number;
  pendingRequests: number;
  totalClicks: number;
}

export interface AdminAuthStatus {
  envConfigured: boolean;
  setupRequired: boolean;
}

export interface NewChannelFormInput {
  channelName: string;
  description: string;
  motivation: string;
  notes: string;
  email: string;
  phone: string;
}

export interface JoinChannelFormInput {
  channelName: string;
  officialUrl: string;
  motivation: string;
  email: string;
  phone: string;
}
