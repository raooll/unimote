FactoryBot.define do
  factory :device_category do
    sequence(:slug) { |n| "cat_#{n}" }
    sequence(:name) { |n| "Category #{n}" }
    default_layout { "generic" }
    factory(:tv_category) { slug { "tv" }; name { "TV" }; default_layout { "tv_standard" } }
    factory(:ac_category) { slug { "ac" }; name { "Air Conditioner" }; default_layout { "ac_panel" } }
  end

  factory :brand do
    sequence(:name) { |n| "Brand #{n}" }
  end

  factory :remote_model do
    brand
    device_category factory: :tv_category
    sequence(:name) { |n| "Model #{n}" }
  end

  factory :remote_config do
    remote_model
    protocol { "ir" }
    sequence(:variant) { |n| "v#{n}" }
    layout_template { "tv_standard" }
    status { "published" }
    popularity { 0 }
    signal_data do
      sig = { "frequency" => 38_000, "duty_cycle" => 0.33, "pattern" => [9000, 4500, 560, 560, 560] }
      { "commands" => { "POWER" => sig, "VOL_UP" => sig } }
    end
  end

  factory :user do
    sequence(:email) { |n| "user#{n}@example.com" }
    password { "password123" }
    name { "Test User" }
  end
end

FactoryBot.define do
  factory :match_report do
    remote_config
    worked { true }
    install_id { "install-1" }
  end
end
