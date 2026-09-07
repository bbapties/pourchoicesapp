-- ============================================================================
-- SNAPSHOT of every Elo as it stood immediately BEFORE the #79 settling replay
-- (2026-09-07). Values produced by the old order-dependent engine.
--
-- Running this restores those exact numbers. It does NOT restore the old
-- engine -- see sql/elo-simultaneous-snapshot.sql for that. Restoring these
-- values while the new engine is live leaves the scoreboard inconsistent with
-- its own history, so only do it to compare, or as the first step of a full
-- rollback.
-- ============================================================================

BEGIN;
UPDATE public.bottle_variants SET elo_global = 1516.00 WHERE id = '0467f8d9-fab0-464c-b297-c35916df639f';
UPDATE public.bottle_variants SET elo_global = 1568.80 WHERE id = '07c5cc1d-d042-4a43-b87d-7e53f15bca51';
UPDATE public.bottle_variants SET elo_global = 1585.84 WHERE id = '0aa4e31e-778e-43c9-a52f-42052a231422';
UPDATE public.bottle_variants SET elo_global = 1621.69 WHERE id = '121d76bf-a9ec-43f0-ac9e-65faaa72b7cb';
UPDATE public.bottle_variants SET elo_global = 1456.08 WHERE id = '1ce568b2-194b-406e-8bf2-a8508223856e';
UPDATE public.bottle_variants SET elo_global = 1426.40 WHERE id = '25220c8b-1565-4a27-b8a5-93be817fb43f';
UPDATE public.bottle_variants SET elo_global = 1399.13 WHERE id = '2fd6d831-b004-46fb-a029-ef07dd710830';
UPDATE public.bottle_variants SET elo_global = 1461.37 WHERE id = '3209de96-ac35-4cdb-8b24-d509a9982300';
UPDATE public.bottle_variants SET elo_global = 1484.00 WHERE id = '32b70702-803f-4757-af32-c405d3edea97';
UPDATE public.bottle_variants SET elo_global = 1544.04 WHERE id = '4688dca0-aa0c-4f8c-b6a1-f516b5dcddf1';
UPDATE public.bottle_variants SET elo_global = 1570.98 WHERE id = '5466c0fd-645d-4def-8004-703c78eb58b3';
UPDATE public.bottle_variants SET elo_global = 1515.36 WHERE id = '5f7b1e9c-f689-4041-a783-c83db8094d37';
UPDATE public.bottle_variants SET elo_global = 1516.00 WHERE id = '6ccfdf9c-17c7-45b2-9b9f-9124af105211';
UPDATE public.bottle_variants SET elo_global = 1515.36 WHERE id = '6ff8d93b-c242-4556-90c6-668aaaf3eefc';
UPDATE public.bottle_variants SET elo_global = 1573.00 WHERE id = '76e0e825-dcc1-4263-85d8-d0fef85b1fcb';
UPDATE public.bottle_variants SET elo_global = 1484.00 WHERE id = '7a717f20-bdd8-460c-bb4a-5a94901d49ea';
UPDATE public.bottle_variants SET elo_global = 1484.00 WHERE id = '7c8d0fa5-f0fe-4839-82e4-c11acdea8d12';
UPDATE public.bottle_variants SET elo_global = 1484.00 WHERE id = '7f0cf189-45ea-4a6c-ac32-59dbc001ace3';
UPDATE public.bottle_variants SET elo_global = 1516.00 WHERE id = '87820a16-2f41-4994-89bd-f8174b7a3980';
UPDATE public.bottle_variants SET elo_global = 1433.72 WHERE id = '8b51779d-691a-4482-9820-a8711ba48bfd';
UPDATE public.bottle_variants SET elo_global = 1484.77 WHERE id = '91bd4d53-1593-4f58-9149-1daddacfb1e2';
UPDATE public.bottle_variants SET elo_global = 1405.83 WHERE id = 'a4a1410a-67f4-44eb-a852-80858d58af46';
UPDATE public.bottle_variants SET elo_global = 1478.59 WHERE id = 'a74424b2-990a-45ab-8b6b-45ca82decb58';
UPDATE public.bottle_variants SET elo_global = 1545.82 WHERE id = 'ad628a1e-82a4-4775-81a6-002caab88c88';
UPDATE public.bottle_variants SET elo_global = 1485.58 WHERE id = 'b69d8c66-74c6-4793-a363-c3d9a0c68daa';
UPDATE public.bottle_variants SET elo_global = 1516.00 WHERE id = 'b7079e0c-2088-472c-a4c8-b2ff0224276e';
UPDATE public.bottle_variants SET elo_global = 1516.00 WHERE id = 'c721a546-1d06-42c2-97c2-196a11a0ffa8';
UPDATE public.bottle_variants SET elo_global = 1454.05 WHERE id = 'c990f9c6-df1f-4b7b-ab53-8ea15cd44f70';
UPDATE public.bottle_variants SET elo_global = 1545.82 WHERE id = 'cc5387bf-7b21-49b5-ab07-8174670a4124';
UPDATE public.bottle_variants SET elo_global = 1515.88 WHERE id = 'd5c0781e-dacf-4718-83f8-aff0214a37a9';
UPDATE public.bottle_variants SET elo_global = 1484.00 WHERE id = 'd7b55a53-b693-4418-87b8-6608a458555d';
UPDATE public.bottle_variants SET elo_global = 1454.05 WHERE id = 'da35ec53-fa61-4734-b158-160e8c5f3c06';
UPDATE public.bottle_variants SET elo_global = 1488.76 WHERE id = 'e0013dea-5213-42ee-868b-4e74152b673e';
UPDATE public.bottle_variants SET elo_global = 1514.90 WHERE id = 'e48868ec-dd4e-475b-9a09-7948265dc655';
UPDATE public.bottle_variants SET elo_global = 1515.36 WHERE id = 'f0a3025a-7a68-407f-94ec-cc21e84fe245';
UPDATE public.bottle_variants SET elo_global = 1484.77 WHERE id = 'fcd43745-b000-4122-a9ce-e29c9fab73a2';
UPDATE public.bottle_variants SET elo_global = 1454.05 WHERE id = 'fe6cfdd8-34f0-40f9-9ecb-e2f6ebf06ddb';
UPDATE public.user_bottles SET elo = 1515.36 WHERE id = '043f8fb2-8dd6-4277-915e-bca3e8cc461c';
UPDATE public.user_bottles SET elo = 1621.69 WHERE id = '067731ba-79a0-4b97-89f9-3449797fecdc';
UPDATE public.user_bottles SET elo = 1454.05 WHERE id = '0e0817b0-9682-4081-a181-c2d313dee9ae';
UPDATE public.user_bottles SET elo = 1516.00 WHERE id = '1143fcfa-b4d5-4ac3-a098-efaf165b8c5a';
UPDATE public.user_bottles SET elo = 1516.00 WHERE id = '14318b5d-eaa8-49cc-9b96-daf8e4f0c3e4';
UPDATE public.user_bottles SET elo = 1570.98 WHERE id = '152e5d81-4ddf-4cfa-adf6-b2ff408c1bea';
UPDATE public.user_bottles SET elo = 1461.37 WHERE id = '17bd793a-18b1-411e-8fdf-84a5c93e7b53';
UPDATE public.user_bottles SET elo = 1568.80 WHERE id = '224929bf-b2b5-4956-8c7c-5563ad12350a';
UPDATE public.user_bottles SET elo = 1515.88 WHERE id = '2791dcf9-f2a7-4105-b93f-86f1ba6453fb';
UPDATE public.user_bottles SET elo = 1485.58 WHERE id = '27ddd6b8-80a7-4b05-82b9-86247059d646';
UPDATE public.user_bottles SET elo = 1516.00 WHERE id = '2dfea90e-391d-4116-a14f-f40208b481ea';
UPDATE public.user_bottles SET elo = 1585.84 WHERE id = '3a69616a-d7c8-4627-9944-9ecb2165ea72';
UPDATE public.user_bottles SET elo = 1545.82 WHERE id = '3aad67d0-2ee3-44e2-8efe-d4ded30a4ac3';
UPDATE public.user_bottles SET elo = 1484.77 WHERE id = '4338d3d2-84d6-4160-a93f-5289e7f3e530';
UPDATE public.user_bottles SET elo = 1484.00 WHERE id = '4838b2c1-24db-4298-ba7f-2373e53cda5f';
UPDATE public.user_bottles SET elo = 1514.90 WHERE id = '48cafbe9-9ba0-44e7-8b55-321448a8da5e';
UPDATE public.user_bottles SET elo = 1456.08 WHERE id = '60745f63-3624-4858-a36f-f4e330bdf6ef';
UPDATE public.user_bottles SET elo = 1573.00 WHERE id = '60c62b9a-07f9-407b-a2c0-90bb56ff663d';
UPDATE public.user_bottles SET elo = 1426.40 WHERE id = '672d9e26-1415-449e-8060-236b35a3e22f';
UPDATE public.user_bottles SET elo = 1454.05 WHERE id = '68df6ca1-cc41-42b7-89f2-95d92d14884e';
UPDATE public.user_bottles SET elo = 1454.05 WHERE id = '87fa1894-4e6c-429b-8559-9a403af85b50';
UPDATE public.user_bottles SET elo = 1488.76 WHERE id = '8e833a13-743c-426b-bb3c-78b548b62f57';
UPDATE public.user_bottles SET elo = 1516.00 WHERE id = '9014f712-90f8-4567-898d-5316fbc5b9dd';
UPDATE public.user_bottles SET elo = 1484.77 WHERE id = '987ef229-2d5e-4992-8e12-14f0bdfc8356';
UPDATE public.user_bottles SET elo = 1484.00 WHERE id = '997e923b-8a2a-4ecd-b59e-dd797d490bd5';
UPDATE public.user_bottles SET elo = 1515.36 WHERE id = 'a1e94e23-4943-41cd-973c-95b7ce4b1d2f';
UPDATE public.user_bottles SET elo = 1405.83 WHERE id = 'ae41eb02-e021-4443-a358-34ab9ad6e43e';
UPDATE public.user_bottles SET elo = 1515.36 WHERE id = 'aefa6ec1-5ad0-4209-923e-5bbce0a676d9';
UPDATE public.user_bottles SET elo = 1478.59 WHERE id = 'b229c7cf-3f67-4e54-8c0e-e6d5447d8b9f';
UPDATE public.user_bottles SET elo = 1484.00 WHERE id = 'c92493cc-c37e-4099-b568-805ac023ad86';
UPDATE public.user_bottles SET elo = 1433.72 WHERE id = 'cd882dea-302f-412c-a024-916b1e392071';
UPDATE public.user_bottles SET elo = 1399.13 WHERE id = 'd1a5d498-c2fb-4815-b3e6-70cbd6b681fe';
UPDATE public.user_bottles SET elo = 1484.00 WHERE id = 'd664a502-47fa-480b-b31a-5ae0fff0c534';
UPDATE public.user_bottles SET elo = 1484.00 WHERE id = 'd828d2d8-b61e-49ac-aaa3-9df099a28d1e';
UPDATE public.user_bottles SET elo = 1544.04 WHERE id = 'dd0d846b-c8a2-4759-ba3b-9ed24bc7c606';
UPDATE public.user_bottles SET elo = 1545.82 WHERE id = 'e2e8f58a-dcee-441a-8271-c3eb96c1ecf5';
UPDATE public.user_bottles SET elo = 1516.00 WHERE id = 'ea1a0692-9f7c-4fb3-8e0d-e93d72d4545c';
COMMIT;
