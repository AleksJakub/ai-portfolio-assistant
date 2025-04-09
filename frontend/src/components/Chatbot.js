import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";

const Chatbot = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [responses, setResponses] = useState({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [riskProfile, setRiskProfile] = useState(null);
  const [showButtons, setShowButtons] = useState(false);
  const [showPortfolioOptions, setShowPortfolioOptions] = useState(false);
  const [portfolioData, setPortfolioData] = useState(null);
  const [showFollowUpOptions, setShowFollowUpOptions] = useState(false);
  const [showInvestmentButton, setShowInvestmentButton] = useState(false);
  const [investmentSuggestions, setInvestmentSuggestions] = useState(null);
  const [showPortfolioInputOptions, setShowPortfolioInputOptions] =
    useState(false);
  const [awaitingPortfolioText, setAwaitingPortfolioText] = useState(false);
  const [isNewPortfolioSuggested, setIsNewPortfolioSuggested] = useState(false);
  const [allowGeneralInvestmentQuestions, setAllowGeneralInvestmentQuestions] =
    useState(false);

  const chatEndRef = useRef(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setMessages((prev) => [
      ...prev,
      { bot: `Uploading and analyzing "${file.name}"...` },
    ]);
    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("risk_profile", riskProfile);

    try {
      const response = await fetch(
        "http://127.0.0.1:8000/analyze-portfolio-file",
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();
      if (data.optimized_portfolio) {
        const formatted = Object.entries(data.optimized_portfolio)
          .map(([key, val]) => `**${key}**: ${val}`)
          .join("\n\n");

        setMessages((prev) => [
          ...prev,
          {
            bot: "Here are your optimized portfolio suggestions from your uploaded file:",
          },
          { bot: formatted },
          { bot: `**Rationale:** ${data.rationale}` },
        ]);
        setAllowGeneralInvestmentQuestions(true);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            bot: "Sorry, I couldn't read or optimize the file. Try again with a valid format.",
          },
        ]);
      }
      setPortfolioData(data.optimized_portfolio);
      setAllowGeneralInvestmentQuestions(true);
      setShowPortfolioInputOptions(false);
      setShowInvestmentButton(true);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { bot: "There was an error uploading or analyzing the file." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const analyzeUserPortfolio = async (textPortfolio) => {
    setLoading(true);
    try {
      const response = await fetch("http://127.0.0.1:8000/analyze-portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: textPortfolio,
          risk_profile: riskProfile,
        }),
      });

      const data = await response.json();
      if (data.optimized_portfolio) {
        const formatted = Object.entries(data.optimized_portfolio)
          .map(([key, val]) => `**${key}**: ${val}`)
          .join("\n\n");

        setMessages((prev) => [
          ...prev,
          {
            bot: "Based on your current portfolio, here are some optimization suggestions:",
          },
          { bot: formatted },
          { bot: `**Rationale:** ${data.rationale}` },
        ]);

        setAllowGeneralInvestmentQuestions(true);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            bot: "Sorry, I couldn't understand or optimize your portfolio. Try again or upload a file.",
          },
        ]);
      }
      setPortfolioData(data.optimized_portfolio);
      setAllowGeneralInvestmentQuestions(true);
      setShowPortfolioInputOptions(false);
      setShowInvestmentButton(true);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { bot: "There was an error analyzing your portfolio." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const questions = [
    "What is your investment time horizon?",
    "How much risk are you comfortable taking?",
    "What are your investment goals?",
    "How would you react to short-term losses?",
    "How much of your savings are you willing to invest in riskier assets?",
  ];

  useEffect(() => {
    if (currentQuestionIndex === 0 && messages.length === 0) {
      setMessages([{ bot: questions[0] }]);
    }
  }, [currentQuestionIndex, messages]);

  const restartQuestionnaire = () => {
    setPortfolioData(null);
    setCurrentQuestionIndex(0);
    setResponses({});
    setRiskProfile(null);
    setMessages([{ bot: questions[0] }]);
    setShowButtons(false);
  };

  const fetchStockInfo = async (ticker) => {
    const response = await fetch(`http://127.0.0.1:8000/stock-info/${ticker}`);
    const data = await response.json();
    console.log(data);
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    const isAdjustmentIntent =
      /add|remove|rebalance|change|increase|update|reduce|swap|adjust/i.test(
        input
      );

    const stockMatch = input.match(
      /(?:about|info on|details of)\s+([A-Z]{2,5})/i
    );
    if (stockMatch) {
      const ticker = stockMatch[1].toUpperCase();
      await fetchStockInfo(ticker);
      return;
    }

    if (allowGeneralInvestmentQuestions) {
      const userMessage = { user: input };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setLoading(true);

      try {
        if (isAdjustmentIntent && portfolioData) {
          const followUpResponse = await fetch(
            "http://127.0.0.1:8000/adjust-portfolio",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                question: input,
                portfolio: portfolioData,
                risk_profile: riskProfile,
              }),
            }
          );

          const followUpData = await followUpResponse.json();

          if (followUpData.adjusted_portfolio) {
            const formatted = Object.entries(followUpData.adjusted_portfolio)
              .map(([key, val]) => `**${key}**: ${val}`)
              .join("\n\n");

            setMessages((prev) => [
              ...prev,
              { bot: "Here is your adjusted portfolio based on your request:" },
              { bot: formatted },
              { bot: `**Explanation:** ${followUpData.explanation}` },
              { bot: `**Risk Warning:** ${followUpData.risk_warning}` },
            ]);
            setPortfolioData(followUpData.adjusted_portfolio);
          } else {
            setMessages((prev) => [
              ...prev,
              {
                bot:
                  followUpData.answer ||
                  "I couldn't adjust your portfolio, sorry!",
              },
            ]);
          }
        } else {
          const response = await fetch(
            "http://127.0.0.1:8000/general-investment-qa",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                question: input,
                risk_profile: riskProfile,
              }),
            }
          );

          const data = await response.json();

          setMessages((prev) => [
            ...prev,
            { bot: data.answer || "Sorry, I couldn't find an answer to that." },
          ]);
        }
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          { bot: "There was an error handling your question." },
        ]);
      } finally {
        setLoading(false);
      }

      return;
    }

    if (awaitingPortfolioText) {
      setMessages((prev) => [
        ...prev,
        { user: input },
        {
          bot: "Thank you! I will analyze this portfolio and suggest optimizations shortly.",
        },
      ]);
      setInput("");
      setAwaitingPortfolioText(false);

      analyzeUserPortfolio(input);
      return;
    }

    if (!showFollowUpOptions && portfolioData) {
      const userMessage = { user: input };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");

      setLoading(true);
      try {
        const followUpResponse = await fetch(
          "http://127.0.0.1:8000/adjust-portfolio",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question: input,
              portfolio: portfolioData,
              risk_profile: riskProfile,
            }),
          }
        );

        const followUpData = await followUpResponse.json();

        if (followUpData.adjusted_portfolio) {
          const formatted = Object.entries(followUpData.adjusted_portfolio)
            .map(([key, val]) => `**${key}**: ${val}`)
            .join("\n\n");

          setMessages((prev) => [
            ...prev,
            { bot: "Here is your adjusted portfolio based on your request:" },
            { bot: formatted },
            { bot: `**Explanation:** ${followUpData.explanation}` },
            { bot: `**Risk Warning:** ${followUpData.risk_warning}` },
          ]);

          setPortfolioData(followUpData.adjusted_portfolio);
        } else {
          setMessages((prev) => [
            ...prev,
            { bot: followUpData.answer || "I couldn't answer that, sorry!" },
          ]);
        }

        setShowInvestmentButton(true);
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          { bot: "There was an error adjusting your portfolio." },
        ]);
      } finally {
        setLoading(false);
      }

      return;
    }

    const userMessage = { user: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const updatedResponses = {
        ...responses,
        [questions[currentQuestionIndex]]: input,
      };
      setResponses(updatedResponses);

      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex((prev) => prev + 1);
        setMessages((prev) => [
          ...prev,
          { bot: questions[currentQuestionIndex + 1] },
        ]);
      } else {
        const response = await fetch("http://127.0.0.1:8000/calculate-risk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: updatedResponses }),
        });

        const data = await response.json();

        if (response.ok && data.final_risk_profile) {
          setRiskProfile(data.final_risk_profile);
          setMessages((prev) => [
            ...prev,
            {
              bot: `Your assigned risk profile is: **${data.final_risk_profile}**.`,
            },
            {
              bot: `**Rationale:** ${data.rationale}`,
            },
            { bot: "Would you like to continue or change your answers?" },
          ]);
          setShowButtons(true);
        } else {
          throw new Error(data.error || "Invalid risk profile response");
        }
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { bot: "Sorry, I encountered an error. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    if (showFollowUpOptions) {
      setShowFollowUpOptions(false);
      handleGetInvestmentSuggestions();
    } else {
      setMessages((prev) => [
        ...prev,
        { bot: "Thank you! Your risk profile has been confirmed." },
        { bot: "Do you already have an investment portfolio?" },
      ]);
      setShowButtons(false);
      setShowPortfolioOptions(true);
    }
  };

  const handlePortfolioChoice = async (answer) => {
    setMessages((prev) => [...prev, { user: answer }]);
    setShowPortfolioOptions(false);

    if (answer === "Yes") {
      setMessages((prev) => [
        ...prev,
        {
          bot: "Would you like to input your current portfolio by text or upload a file?",
        },
      ]);
      setShowPortfolioInputOptions(true);
    } else if (answer === "No") {
      setIsNewPortfolioSuggested(true);
      setMessages((prev) => [
        ...prev,
        { bot: "Generating your suggested portfolio allocation..." },
      ]);
      try {
        const response = await fetch(
          "http://127.0.0.1:8000/suggest-portfolio",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ risk_profile: riskProfile }),
          }
        );

        const data = await response.json();

        if (data.portfolio) {
          setPortfolioData(data.portfolio);
          const formattedPortfolio = Object.entries(data.portfolio)
            .map(([key, value]) => `**${key}**: ${value}`)
            .join("\n\n");

          setMessages((prev) => [
            ...prev,
            { bot: "Here is your suggested portfolio allocation:" },
            { bot: formattedPortfolio },
            { bot: `**Rationale:** ${data.rationale}` },
          ]);
          setShowFollowUpOptions(true);
        } else {
          throw new Error("Portfolio suggestion failed.");
        }
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          {
            bot: "I encountered an error while generating your portfolio suggestion.",
          },
        ]);
      }
    } else {
      setMessages((prev) => [
        ...prev,
        {
          bot: "Great! Please describe your current portfolio or type your questions about optimizing it. I'm here to help!",
        },
        {
          bot: "For example, you can say: 'I have 60% stocks and 40% bonds, is that suitable?' or 'How can I improve diversification?'",
        },
      ]);
      setShowFollowUpOptions(true);
    }
  };

  const handleGetInvestmentSuggestions = async () => {
    setMessages((prev) => [
      ...prev,
      { bot: "Fetching top investment suggestions for you..." },
    ]);
    setLoading(true);

    try {
      const response = await fetch(
        "http://127.0.0.1:8000/suggest-investments",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            risk_profile: riskProfile,
            portfolio: portfolioData,
          }),
        }
      );

      const data = await response.json();

      if (data.investments) {
        let formattedMessage = "";
        for (const [category, items] of Object.entries(data.investments)) {
          formattedMessage += `\n\n**${category}**\n`;
          items.forEach((item, index) => {
            formattedMessage += `${index + 1}. ${item.name}${
              item.symbol ? ` (${item.symbol})` : ""
            } - ${item.description}\n`;
          });
          formattedMessage += `\n`;
        }

        setMessages((prev) => [
          ...prev,
          { bot: "Here are your tailored investment suggestions:" },
          { bot: formattedMessage },
        ]);
        setAllowGeneralInvestmentQuestions(true);
        setShowInvestmentButton(false);
      } else {
        throw new Error("Investment suggestions response invalid.");
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          bot: "I encountered an error while fetching investment suggestions.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <div className="bg-blue-600 text-white text-lg font-semibold py-4 px-6 shadow-md">
        AI Portfolio Assistant
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((msg, index) => (
          <div key={index} className="mb-4">
            {msg.user && (
              <div className="flex justify-end">
                <div className="bg-blue-500 text-white rounded-lg p-3 max-w-md shadow-md text-right">
                  <p className="text-sm">{msg.user}</p>
                </div>
              </div>
            )}

            {msg.bot && (
              <div className="flex justify-start mt-2">
                <div className="bg-gray-200 text-gray-800 rounded-lg p-4 max-w-xl shadow-md text-left">
                  <div className="text-sm">
                    <ReactMarkdown>{msg.bot}</ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start mt-2">
            <div className="bg-gray-300 text-gray-800 rounded-lg p-3 max-w-xl shadow-md italic text-left">
              AI is typing...
            </div>
          </div>
        )}

        {showButtons && (
          <div className="flex justify-center mt-4 space-x-4">
            <button
              className="bg-red-500 text-white px-5 py-2 rounded-lg shadow-md hover:bg-red-600 transition"
              onClick={restartQuestionnaire}
            >
              Change Answers
            </button>
            <button
              className="bg-green-500 text-white px-5 py-2 rounded-lg shadow-md hover:bg-green-600 transition"
              onClick={handleContinue}
            >
              Continue
            </button>
          </div>
        )}

        {showPortfolioOptions && (
          <div className="flex justify-center mt-4 space-x-4">
            <button
              className="bg-blue-500 text-white px-5 py-2 rounded-lg shadow-md hover:bg-blue-600 transition"
              onClick={() => handlePortfolioChoice("Yes")}
            >
              Yes
            </button>
            <button
              className="bg-green-500 text-white px-5 py-2 rounded-lg shadow-md hover:bg-green-600 transition"
              onClick={() => handlePortfolioChoice("No")}
            >
              No
            </button>
          </div>
        )}

        {showFollowUpOptions && isNewPortfolioSuggested && (
          <div className="flex justify-center mt-4 space-x-4">
            <button
              className="bg-purple-500 text-white px-5 py-2 rounded-lg shadow-md hover:bg-purple-600 transition"
              onClick={() => setShowFollowUpOptions(false)}
            >
              Ask follow-up questions
            </button>
            <button
              className="bg-green-500 text-white px-5 py-2 rounded-lg shadow-md hover:bg-green-600 transition"
              onClick={handleContinue}
            >
              Continue
            </button>
          </div>
        )}

        {showPortfolioInputOptions && (
          <div className="flex justify-center mt-4 space-x-4">
            <button
              className="bg-blue-500 text-white px-5 py-2 rounded-lg shadow-md hover:bg-blue-600 transition"
              onClick={() => {
                setShowPortfolioInputOptions(false);
                setAwaitingPortfolioText(true);
                setMessages((prev) => [
                  ...prev,
                  { bot: "Please type your portfolio details below:" },
                ]);
              }}
            >
              Enter by text
            </button>
            <label className="bg-green-500 text-white px-5 py-2 rounded-lg shadow-md hover:bg-green-600 transition cursor-pointer">
              Upload file
              <input
                type="file"
                accept=".txt,.csv,.pdf,.xlsx"
                hidden
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (!file) return;

                  const reader = new FileReader();
                  reader.onload = async (event) => {
                    const fileText = event.target.result;

                    setMessages((prev) => [
                      ...prev,
                      { user: `Uploaded file: ${file.name}` },
                      { bot: "Analyzing your uploaded portfolio..." },
                    ]);

                    await analyzeUserPortfolio(fileText);
                  };
                  reader.readAsText(file);
                }}
              />
            </label>
          </div>
        )}

        {showInvestmentButton && (
          <div className="flex justify-center mt-4">
            <button
              className="bg-indigo-600 text-white px-6 py-3 rounded-lg shadow-md hover:bg-indigo-700 transition"
              onClick={handleGetInvestmentSuggestions}
            >
              Continue to Investments
            </button>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {!showButtons && (
        <div className="bg-white p-4 flex items-center border-t">
          <input
            type="text"
            className="flex-1 border rounded-lg px-4 py-2 text-gray-800 shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Type your answer..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && sendMessage()}
          />
          <button
            className="ml-3 bg-blue-600 text-white px-5 py-2 rounded-lg shadow-md hover:bg-blue-700 transition"
            onClick={sendMessage}
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
};

export default Chatbot;
