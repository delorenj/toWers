export interface Project {
  uuid: string;
  name: string;
  created_at: Date;
  active_profile_uuid: string | null;
}
