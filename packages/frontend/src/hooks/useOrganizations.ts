/**
 * 白名单组织列表 hook（关于/说明场景，可选）。
 * 一次性加载。
 */
import { api, type OrganizationsResponse } from '../api/client'
import { useAsync, type AsyncState } from './useAsync'

export interface UseOrganizationsResult extends AsyncState<OrganizationsResponse> {}

export function useOrganizations(): UseOrganizationsResult {
  return useAsync((signal) => api.organizations({ signal }), [])
}
