import { MockedAmplicationLoggerProvider } from "@amplication/util/nestjs/logging/test-utils";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import {
  AssistantService,
  EnumAssistantFunctions,
  MESSAGE_UPDATED_EVENT,
  MessageLoggerContext,
} from "./assistant.service";
import { BillingService } from "../billing/billing.service";

import { PluginCatalogService } from "../pluginCatalog/pluginCatalog.service";
import { PluginInstallationService } from "../pluginInstallation/pluginInstallation.service";
import { ModuleActionService } from "../moduleAction/moduleAction.service";
import { ModuleDtoService } from "../moduleDto/moduleDto.service";
import { ResourceService } from "../resource/resource.service";
import { EntityService } from "../entity/entity.service";
import { ModuleService } from "../module/module.service";
import { ProjectService } from "../project/project.service";
import { GraphqlSubscriptionPubSubKafkaService } from "./graphqlSubscriptionPubSubKafka.service";
import { Env } from "../../env";
import { billingServiceMock } from "../billing/billing.service.mock";
import { AssistantContext } from "./dto/AssistantContext";
import { AmplicationError } from "../../errors/AmplicationError";
import { BillingFeature } from "@amplication/util-billing-types";
import { Entity } from "../../models";
import { id } from "date-fns/locale";

const EXAMPLE_CHAT_OPENAI_KEY = "EXAMPLE_CHAT_OPENAI_KEY";
const EXAMPLE_WORKSPACE_ID = "EXAMPLE_WORKSPACE_ID";
const EXAMPLE_PROJECT_ID = "EXAMPLE_PROJECT_ID";
const EXAMPLE_RESOURCE_ID = "EXAMPLE_RESOURCE_ID";
const EXAMPLE_THREAD_ID = "EXAMPLE_THREAD_ID";
const EXAMPLE_USER_ID = "EXAMPLE_USER_ID";

const EXAMPLE_ENTITY: Entity = {
  id: "exampleEntityId",
  createdAt: new Date(),
  updatedAt: new Date(),
  resourceId: "exampleResourceId",
  name: "exampleName",
  displayName: "exampleDisplayName",
  pluralDisplayName: "examplePluralDisplayName",
  customAttributes: "exampleCustomAttributes",
  lockedByUserId: EXAMPLE_USER_ID,
};

const EXAMPLE_ASSISTANT_CONTEXT: AssistantContext = {
  user: {
    workspace: {
      allowLLMFeatures: true,
      id: EXAMPLE_WORKSPACE_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: "",
    },
    id: EXAMPLE_USER_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    isOwner: true,
  },
  workspaceId: EXAMPLE_WORKSPACE_ID,
};

const pubSubPublishMock = jest.fn();

const mockGraphqlSubscriptionKafkaService = {
  getPubSub: jest.fn(() => ({
    publish: pubSubPublishMock,
    asyncIterator: jest.fn(),
  })),
};

const createOneEntityMock = jest.fn(() => EXAMPLE_ENTITY);
const createFieldByDisplayNameMock = jest.fn();
const createProjectMock = jest.fn();
const createServiceWithDefaultSettingsMock = jest.fn();
const createModuleMock = jest.fn();
const installPluginMock = jest.fn(() => ({ id: "examplePluginId" }));
const getPluginWithLatestVersionMock = jest.fn(() => ({
  id: "examplePluginId",
  pluginId: "examplePluginId",
  name: "exampleName",
  description: "exampleDescription",
  repo: "exampleRepo",
  npm: "exampleNpm",
  icon: "exampleIcon",
  github: "exampleGithub",
  website: "exampleWebsite",
  categories: ["exampleCategory1", "exampleCategory2"],
  type: "exampleType",
  taggedVersions: {},
  versions: [
    {
      id: "exampleVersionId",
      pluginId: "examplePluginId",
      deprecated: false,
      isLatest: true,
      version: "exampleVersion",
      settings: {},
      configurations: {},
    },
  ],
}));

describe("AssistantService", () => {
  let service: AssistantService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      imports: [],
      providers: [
        AssistantService,
        {
          provide: BillingService,
          useValue: billingServiceMock,
        },
        {
          provide: ConfigService,
          useValue: {
            get: (variable) => {
              switch (variable) {
                case Env.CHAT_OPENAI_KEY:
                  return EXAMPLE_CHAT_OPENAI_KEY;
                case Env.FEATURE_AI_ASSISTANT_ENABLED:
                  return "true";
                default:
                  return "";
              }
            },
          },
        },
        {
          provide: EntityService,
          useValue: {
            createOneEntity: createOneEntityMock,
            createFieldByDisplayName: createFieldByDisplayNameMock,
          },
        },
        {
          provide: ResourceService,
          useValue: {
            createServiceWithDefaultSettings:
              createServiceWithDefaultSettingsMock,
          },
        },
        {
          provide: ModuleService,
          useValue: {
            create: createModuleMock,
          },
        },
        {
          provide: ProjectService,
          useValue: {
            createProject: createProjectMock,
          },
        },
        {
          provide: PluginCatalogService,
          useValue: {
            getPluginWithLatestVersion: getPluginWithLatestVersionMock,
          },
        },
        {
          provide: ModuleActionService,
          useValue: {},
        },
        {
          provide: ModuleDtoService,
          useValue: {},
        },
        {
          provide: GraphqlSubscriptionPubSubKafkaService,
          useValue: mockGraphqlSubscriptionKafkaService,
        },
        {
          provide: PluginInstallationService,
          useValue: {
            create: installPluginMock,
          },
        },
        MockedAmplicationLoggerProvider,
      ],
    }).compile();

    service = module.get<AssistantService>(AssistantService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should throw an AmplicationError if AI-powered features are disabled for the workspace", async () => {
    const context = {
      ...EXAMPLE_ASSISTANT_CONTEXT,
      user: {
        ...EXAMPLE_ASSISTANT_CONTEXT.user,
        workspace: {
          ...EXAMPLE_ASSISTANT_CONTEXT.user.workspace,
          allowLLMFeatures: false,
        },
      },
    };

    await expect(service.validateAndReportUsage(context)).rejects.toThrow(
      new AmplicationError(
        "AI-powered features are disabled for this workspace"
      )
    );
  });

  it("should publish a message when onMessageUpdated is called", async () => {
    const threadId = "testThread123";
    const messageId = "message123";
    const textDelta = "Hello, this is a test message.";
    const snapshot = "Current text snapshot";
    const completed = false;

    await service.onMessageUpdated(
      threadId,
      messageId,
      textDelta,
      snapshot,
      completed
    );

    expect(pubSubPublishMock).toHaveBeenCalledWith(
      MESSAGE_UPDATED_EVENT,
      JSON.stringify({
        id: "messageId",
        threadId,
        text: textDelta,
        snapshot,
        completed,
      })
    );
  });

  it("should check billing feature and report usage when AI features are enabled and billing is active", async () => {
    await service.validateAndReportUsage(EXAMPLE_ASSISTANT_CONTEXT);

    expect(billingServiceMock.getMeteredEntitlement).toHaveBeenCalledWith(
      EXAMPLE_ASSISTANT_CONTEXT.user.workspace.id,
      BillingFeature.JovuRequests
    );
    expect(billingServiceMock.reportUsage).toHaveBeenCalledWith(
      EXAMPLE_ASSISTANT_CONTEXT.user.workspace.id,
      BillingFeature.JovuRequests
    );
  });

  it.each([
    [
      EnumAssistantFunctions.CreateEntity,
      {
        name: "value1",
        serviceId: "value2",
        fields: ["value3", "value4"],
      },
      [
        {
          mock: createOneEntityMock,
          times: 1,
        },
        {
          mock: createFieldByDisplayNameMock,
          times: 2,
        },
      ],
    ],
    [
      EnumAssistantFunctions.CreateProject,
      { projectName: "New Project" },
      [
        {
          mock: createProjectMock,
          times: 1,
        },
      ],
    ],
    [
      EnumAssistantFunctions.CreateService,
      {
        serviceName: "New Service",
        projectId: "proj123",
        adminUIPath: "/admin-ui",
        serverPath: "/server",
      },
      [
        {
          mock: createServiceWithDefaultSettingsMock,
          times: 1,
        },
      ],
    ],
    [
      EnumAssistantFunctions.CreateModule,
      {
        moduleName: "New Module",
        moduleDescription: "Module Description",
        serviceId: "service123",
      },
      [
        {
          mock: createModuleMock,
          times: 1,
        },
      ],
    ],
    [
      EnumAssistantFunctions.InstallPlugins,
      {
        pluginIds: ["plugin1", "plugin2"],
        serviceId: "service123",
      },
      [
        {
          mock: getPluginWithLatestVersionMock,
          times: 2,
        },
        {
          mock: installPluginMock,
          times: 2,
        },
      ],
    ],
  ])(
    "should execute function %s correctly",
    async (functionName, params, mocks) => {
      const loggerContext: MessageLoggerContext = {
        messageContext: {
          workspaceId: EXAMPLE_WORKSPACE_ID,
          projectId: EXAMPLE_PROJECT_ID,
          serviceId: EXAMPLE_RESOURCE_ID,
        },
        threadId: EXAMPLE_THREAD_ID,
        userId: EXAMPLE_USER_ID,
        role: "user",
      };

      await service.executeFunction(
        "callId",
        functionName,
        JSON.stringify(params),
        EXAMPLE_ASSISTANT_CONTEXT,
        loggerContext
      );

      mocks.forEach((mock) => {
        expect(mock.mock).toHaveBeenCalledTimes(mock.times);
      });
    }
  );
});
