import type { Brand, Category, ModelSummary } from '../api/types';

export type RootStackParamList = {
  Tabs: undefined;
  AddCategory: undefined;
  AddBrand: { category: Category };
  AddModel: { category: Category; brand: Brand };
  Match: { category: Category; brand?: Brand; model?: ModelSummary };
  RequestModel: { category: Category; brand?: string; model?: string };
  SaveRemote: { remoteId: number };
  Remote: { id: string };
  ConnectDevice: { id: string };
  Nearby: undefined;
  Account: undefined;
  Learn: undefined;
  SceneEdit: { id?: string };
  Panel: { id: string };
  PanelEdit: { id?: string };
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
